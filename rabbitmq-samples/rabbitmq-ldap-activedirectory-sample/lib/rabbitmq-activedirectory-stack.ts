import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ds from 'aws-cdk-lib/aws-directoryservice';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as targets from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as fs from 'fs';
import * as path from 'path';

export interface RabbitMqActiveDirectoryStackProps extends cdk.StackProps {
}

export class RabbitMqActiveDirectoryStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly activeDirectory: ds.CfnMicrosoftAD;
  public readonly nlb: elbv2.NetworkLoadBalancer;
  public readonly caCertBucket: s3.Bucket;
  public readonly amazonMqAssumeRole: iam.Role;

  constructor(scope: Construct, id: string, props: RabbitMqActiveDirectoryStackProps) {
    super(scope, id, props);

    // Generate passwords
    const adAdminPassword = new secretsmanager.Secret(this, 'ADAdminPassword', {
      secretName: 'RabbitMqAdminPassword',
      generateSecretString: {
        passwordLength: 12,
        excludeCharacters: '"@/\\',
        requireEachIncludedType: true,
        includeSpace: false,
      },
    });

    const dnLookupUserPassword = new secretsmanager.Secret(this, 'DnLookupUserPasswordSecret', {
      secretName: 'RabbitMqDnLookupUserPassword',
      generateSecretString: {
        passwordLength: 12,
        excludeCharacters: '"@/\\',
        requireEachIncludedType: true,
        includeSpace: false,
      },
    });

    const consoleUserPassword = new secretsmanager.Secret(this, 'ConsoleUserPasswordSecret', {
      secretName: 'RabbitMqConsoleUserPassword',
      generateSecretString: {
        passwordLength: 12,
        excludeCharacters: '"@/\\',
        requireEachIncludedType: true,
        includeSpace: false,
      },
    });

    const amqpUserPassword = new secretsmanager.Secret(this, 'AmqpUserPasswordSecret', {
      secretName: 'RabbitMqAmqpUserPassword',
      generateSecretString: {
        passwordLength: 12,
        excludeCharacters: '"@/\\',
        requireEachIncludedType: true,
        includeSpace: false,
      },
    });

    // Read certificate files
    const certPath = path.join(__dirname, '..', 'certs');
    const serverCert = fs.readFileSync(path.join(certPath, 'server-cert.pem'), 'utf8');
    const serverKey = fs.readFileSync(path.join(certPath, 'server-private-key.pem'), 'utf8');
    const caCert = fs.readFileSync(path.join(certPath, 'ca-cert.pem'), 'utf8');

    // Create VPC
    this.vpc = new ec2.Vpc(this, 'VPC', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // Create Managed Microsoft AD
    this.activeDirectory = new ds.CfnMicrosoftAD(this, 'ActiveDirectory', {
      name: 'rabbitmq-ldap.tutorial.local',
      password: adAdminPassword.secretValue.unsafeUnwrap(),
      vpcSettings: {
        vpcId: this.vpc.vpcId,
        subnetIds: this.vpc.privateSubnets.map(subnet => subnet.subnetId),
      },
      edition: 'Standard',
    });

    // Upload server certificate to IAM
    const iamCertificate = new iam.CfnServerCertificate(this, 'ServerCertificate', {
      certificateBody: serverCert,
      privateKey: serverKey,
      serverCertificateName: `ldap-server-cert-${this.stackName}-${this.region}`,
    });

    // Create Network Load Balancer
    this.nlb = new elbv2.NetworkLoadBalancer(this, 'NLB', {
      vpc: this.vpc,
      internetFacing: true,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
    });

    // NLB depends on certificate for proper creation/deletion order
    this.nlb.node.addDependency(iamCertificate);

    // Create TLS Listener on NLB for LDAPS (port 636) -> LDAP (port 389)
    const ldapTargetGroup = new elbv2.NetworkTargetGroup(this, 'LDAPTargetGroup', {
      port: 389,
      protocol: elbv2.Protocol.TCP,
      vpc: this.vpc,
      targetType: elbv2.TargetType.IP,
    });

    const ldapsListener = this.nlb.addListener('LDAPSListener', {
      port: 636,
      protocol: elbv2.Protocol.TLS,
      certificates: [
        elbv2.ListenerCertificate.fromArn(`arn:aws:iam::${this.account}:server-certificate/${iamCertificate.serverCertificateName}`)
      ],
      defaultTargetGroups: [ldapTargetGroup],
    });

    // Add deletion policy to handle certificate cleanup
    iamCertificate.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    // Create custom resource to create AD user using existing secrets
    const createUserFunction = new lambda.Function(this, 'CreateADUsersFunction', {
      runtime: lambda.Runtime.PYTHON_3_10,
      handler: 'create-ad-users.handler',
      code: lambda.Code.fromAsset('lambda'),
      timeout: cdk.Duration.minutes(15),
    });

    // Grant necessary permissions to the Lambda function
    createUserFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ds:DescribeDirectories',
        'ds:AccessDSData',
        'ds:EnableDirectoryDataAccess',
        'ds-data:CreateUser',
        'ds-data:DeleteUser',
        'ds:ResetUserPassword',
        'ds-data:CreateGroup',
        'ds-data:AddGroupMember',
        'secretsmanager:GetSecretValue',
      ],
      resources: ['*'],
    }));

    const userCreator = new cr.Provider(this, 'UserCreatorProvider', {
      onEventHandler: createUserFunction,
      logRetention: 7,
    });

    const createUser = new cdk.CustomResource(this, 'CreateUser', {
      serviceToken: userCreator.serviceToken,
      properties: {
        Username: 'RabbitMqDnLookupUser',
        DirectoryId: this.activeDirectory.ref,
        SecretArn: dnLookupUserPassword.secretArn,
        Version: '2',
      },
    });
    createUser.node.addDependency(dnLookupUserPassword);

    // Create console user
    const createConsoleUser = new cdk.CustomResource(this, 'CreateConsoleUser', {
      serviceToken: userCreator.serviceToken,
      properties: {
        Username: 'RabbitMqConsoleUser',
        DirectoryId: this.activeDirectory.ref,
        SecretArn: consoleUserPassword.secretArn,
        Version: '2',
      },
    });
    createConsoleUser.node.addDependency(consoleUserPassword);

    // Create AMQP user
    const createAmqpUser = new cdk.CustomResource(this, 'CreateAmqpUser', {
      serviceToken: userCreator.serviceToken,
      properties: {
        Username: 'RabbitMqAmqpUser',
        DirectoryId: this.activeDirectory.ref,
        SecretArn: amqpUserPassword.secretArn,
        Version: '2',
      }
    });
    createAmqpUser.node.addDependency(amqpUserPassword);

    const userDn = createUser.getAttString('UserDN');
    const consoleUserDn = createConsoleUser.getAttString('UserDN');
    const amqpUserDn = createAmqpUser.getAttString('UserDN');

    // Register AD DNS IPs as targets
    ldapTargetGroup.addTarget(new targets.IpTarget(cdk.Fn.select(0, this.activeDirectory.attrDnsIpAddresses)));
    ldapTargetGroup.addTarget(new targets.IpTarget(cdk.Fn.select(1, this.activeDirectory.attrDnsIpAddresses)));

    // Create S3 bucket for CA certificate
    this.caCertBucket = new s3.Bucket(this, 'CACertBucket', {
      bucketName: `rabbitmq-ca-certs-${this.account}-${this.region}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Upload CA certificate to S3
    new s3deploy.BucketDeployment(this, 'DeployCA', {
      sources: [s3deploy.Source.data('ca-cert.pem', caCert)],
      destinationBucket: this.caCertBucket,
    });

    // Create Secrets Manager secret for DN lookup user password
    this.amazonMqAssumeRole = new iam.Role(this, 'AmazonMqAssumeRole', {
      assumedBy: new iam.ServicePrincipal('mq.amazonaws.com', {
        conditions: {
          StringEquals: {
            'aws:SourceAccount': this.account,
          },
          ArnLike: {
            'aws:SourceArn': `arn:aws:mq:${this.region}:${this.account}:broker:rabbitmq-ldap-test-*`,
          },
        },
      }),
      description: 'IAM role for Amazon MQ to access S3 and Secrets Manager',
    });

    // Grant S3 read access to the role
    this.caCertBucket.grantRead(this.amazonMqAssumeRole);

    // Grant Secrets Manager read access to the role
    dnLookupUserPassword.grantRead(this.amazonMqAssumeRole);
    consoleUserPassword.grantRead(this.amazonMqAssumeRole);
    amqpUserPassword.grantRead(this.amazonMqAssumeRole);

    // Output important values
    // RabbitMQ LDAP Configuration
    new cdk.CfnOutput(this, 'NLBDnsName', {
      value: this.nlb.loadBalancerDnsName,
      description: 'Network Load Balancer DNS name',
    });

    new cdk.CfnOutput(this, 'CaCertArn', {
      value: `${this.caCertBucket.bucketArn}/ca-cert.pem`,
      description: 'S3 object ARN for issuer certificate used to validate the LDAP server certificate',
    });

    new cdk.CfnOutput(this, 'AmazonMqAssumeRoleArn', {
      value: this.amazonMqAssumeRole.roleArn,
      description: 'IAM role ARN that Amazon MQ assumes to retrieve DnLookupUserPasswordArn and CaCertArn',
    });

    new cdk.CfnOutput(this, 'DnLookupUserDn', {
      value: userDn,
      description: 'Distinguished Name (DN) for DN lookup binding to resolve usernames to full DNs',
    });

    new cdk.CfnOutput(this, 'DnLookupUserPasswordArn', {
      value: dnLookupUserPassword.secretArn,
      description: 'DN lookup user password (Secrets Manager ARN)',
    });

    new cdk.CfnOutput(this, 'DnLookupBase', {
      value: 'DC=rabbitmq-ldap,DC=tutorial,DC=local',
      description: 'LDAP DN lookup base for RabbitMQ configuration',
    });

    new cdk.CfnOutput(this, 'DnLookupAttribute', {
      value: 'sAMAccountName',
      description: 'LDAP attribute for username (defaults to sAMAccountName)',
    });

    new cdk.CfnOutput(this, 'RabbitMqAdministratorsGroupDn', {
      value: 'CN=RabbitMqAdministrators,OU=Users,OU=rabbitmq-ldap,DC=rabbitmq-ldap,DC=tutorial,DC=local',
      description: 'Distinguished Name (DN) of RabbitMqAdministrators group for administrator permissions',
    });

    new cdk.CfnOutput(this, 'RabbitMqMonitoringUsersGroupDn', {
      value: 'CN=RabbitMqMonitoringUsers,OU=Users,OU=rabbitmq-ldap,DC=rabbitmq-ldap,DC=tutorial,DC=local',
      description: 'Distinguished Name (DN) of RabbitMqMonitoringUsers group for management console access',
    });

    // RabbitMQ Management Console Access
    new cdk.CfnOutput(this, 'ConsoleUserPasswordArn', {
      value: consoleUserPassword.secretArn,
      description: 'Console user password (Secrets Manager ARN)',
    });

    // AMQP Connection Access
    new cdk.CfnOutput(this, 'AmqpUserPasswordArn', {
      value: amqpUserPassword.secretArn,
      description: 'AMQP user password (Secrets Manager ARN)',
    });

    // General Stack Information
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
    });

    new cdk.CfnOutput(this, 'ActiveDirectoryId', {
      value: this.activeDirectory.ref,
      description: 'Active Directory ID',
    });

    new cdk.CfnOutput(this, 'CertificateArn', {
      value: iamCertificate.attrArn,
      description: 'IAM Certificate ARN',
    });

    new cdk.CfnOutput(this, 'AdminPasswordArn', {
      value: adAdminPassword.secretArn,
      description: 'Active Directory admin password (Secrets Manager ARN)',
    });
  }
}
