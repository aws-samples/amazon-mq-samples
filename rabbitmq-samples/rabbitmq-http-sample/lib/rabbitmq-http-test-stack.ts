import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as elbv2_targets from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface RabbitMqHttpTestStackProps extends cdk.StackProps {
  serverCertificateArn: string;
}

export class RabbitMqHttpTestStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: RabbitMqHttpTestStackProps) {
    super(scope, id, props);

    // ===========================================
    // Stable suffix based on stack identity
    // NEVER changes across deploys
    // ===========================================
    const stableSuffix = crypto
        .createHash('md5')
        .update(`${this.stackName}-${this.account}-${this.region}`)
        .digest('hex')
        .substring(0, 8);

    // ===========================================
    // Certificate directory and content
    // ===========================================
    const certDir = path.join(__dirname, '../certs');

    // Read CA cert content
    const caCertContent = fs.readFileSync(path.join(certDir, 'ca-cert.pem'), 'utf8').trim() + '\n';

    // Hash of CA cert - used to trigger trust store refresh
    const caCertHash = crypto
        .createHash('md5')
        .update(caCertContent)
        .digest('hex')
        .substring(0, 8);

    // Hash of all certs - used to trigger EC2 replacement when any cert changes
    const allCertsHash = crypto.createHash('md5')
        .update(fs.readFileSync(path.join(certDir, 'ca-cert.pem')))
        .update(fs.readFileSync(path.join(certDir, 'server-cert.pem')))
        .update(fs.readFileSync(path.join(certDir, 'server-key.pem')))
        .update(fs.readFileSync(path.join(certDir, 'client-cert.pem')))
        .update(fs.readFileSync(path.join(certDir, 'client-key.pem')))
        .digest('hex')
        .substring(0, 8);

    // ===========================================
    // Secrets
    // ===========================================
    const serverKeySecret = new secretsmanager.Secret(this, 'ServerKeySecret', {
      secretName: `rabbitmq-server-key-${stableSuffix}`,
      secretStringValue: cdk.SecretValue.unsafePlainText(
          fs.readFileSync(path.join(certDir, 'server-key.pem'), 'utf8')
      ),
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const clientKeySecret = new secretsmanager.Secret(this, 'ClientKeySecret', {
      secretName: `rabbitmq-client-key-${stableSuffix}`,
      secretStringValue: cdk.SecretValue.unsafePlainText(
          fs.readFileSync(path.join(certDir, 'client-key.pem'), 'utf8')
      ),
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const consolePassword = new secretsmanager.Secret(this, 'ConsoleUserPassword', {
      secretName: `rabbitmq-console-pass-${stableSuffix}`,
      generateSecretString: {
        passwordLength: 16,
        excludePunctuation: true
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const amqpPassword = new secretsmanager.Secret(this, 'AmqpUserPassword', {
      secretName: `rabbitmq-amqp-pass-${stableSuffix}`,
      generateSecretString: {
        passwordLength: 16,
        excludePunctuation: true
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // ===========================================
    // S3 bucket for certificates
    // ===========================================
    const certBucket = new s3.Bucket(this, 'CertBucket', {
      bucketName: `rabbitmq-http-auth-certs-${stableSuffix}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    const certDeployment = new s3deploy.BucketDeployment(this, 'DeployCerts', {
      sources: [s3deploy.Source.asset(certDir)],
      destinationBucket: certBucket,
      include: ['ca-cert.pem', 'server-cert.pem', 'client-cert.pem']
    });

    // ===========================================
    // Trust Store Bucket (STABLE NAME)
    // ===========================================
    const trustStoreBucket = new s3.Bucket(this, 'TrustStoreBucket', {
      bucketName: `rabbitmq-http-auth-truststore-${stableSuffix}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    // Deploy CA cert to S3 (STABLE KEY NAME)
    const trustStoreDeployment = new s3deploy.BucketDeployment(this, 'DeployTrustStore', {
      sources: [
        s3deploy.Source.data('ca-bundle.pem', caCertContent)
      ],
      destinationBucket: trustStoreBucket,
      prune: false
    });

    // ===========================================
    // Trust Store (ALL 3 PROPERTIES STABLE)
    // ===========================================
    const trustStore = new elbv2.CfnTrustStore(this, 'TrustStore', {
      name: `rmq-ts-${stableSuffix}`,                            // STABLE
      caCertificatesBundleS3Bucket: trustStoreBucket.bucketName, // STABLE
      caCertificatesBundleS3Key: 'ca-bundle.pem',                // STABLE
    });
    trustStore.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
    trustStore.node.addDependency(trustStoreDeployment);

    // ===========================================
    // Custom Resource: Refresh Trust Store when CA cert changes
    // ===========================================
    const refreshTrustStore = new cr.AwsCustomResource(this, 'RefreshTrustStore', {
      onCreate: {
        service: '@aws-sdk/client-elastic-load-balancing-v2',  // SDK v3 package name
        action: 'ModifyTrustStoreCommand',                      // SDK v3 command name
        parameters: {
          TrustStoreArn: trustStore.attrTrustStoreArn,
          CaCertificatesBundleS3Bucket: trustStoreBucket.bucketName,
          CaCertificatesBundleS3Key: 'ca-bundle.pem',
        },
        physicalResourceId: cr.PhysicalResourceId.of(`refresh-ts-${caCertHash}`),
      },
      onUpdate: {
        service: '@aws-sdk/client-elastic-load-balancing-v2',
        action: 'ModifyTrustStoreCommand',
        parameters: {
          TrustStoreArn: trustStore.attrTrustStoreArn,
          CaCertificatesBundleS3Bucket: trustStoreBucket.bucketName,
          CaCertificatesBundleS3Key: 'ca-bundle.pem',
        },
        physicalResourceId: cr.PhysicalResourceId.of(`refresh-ts-${caCertHash}`),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['elasticloadbalancing:ModifyTrustStore'],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          actions: ['s3:GetObject'],
          resources: [`${trustStoreBucket.bucketArn}/*`],
        }),
      ]),
    });
    refreshTrustStore.node.addDependency(trustStore);
    refreshTrustStore.node.addDependency(trustStoreDeployment);

    // ===========================================
    // VPC
    // ===========================================
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 1
    });

    // ===========================================
    // Security Groups
    // ===========================================
    const ec2Sg = new ec2.SecurityGroup(this, 'EC2SecurityGroup', {
      vpc,
      allowAllOutbound: true,
      description: 'Security group for EC2'
    });
    ec2Sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(8000));

    // ===========================================
    // IAM Role for EC2
    // ===========================================
    const role = new iam.Role(this, 'EC2Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
      ]
    });

    consolePassword.grantRead(role);
    amqpPassword.grantRead(role);

    // ===========================================
    // Django app directory
    // ===========================================
    const djangoDir = '/opt/rabbitmq-server/deps/rabbitmq_auth_backend_http/examples/rabbitmq_auth_backend_django';

    // ===========================================
    // User Data
    // ===========================================
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
        '#!/bin/bash',
        `# Cert hash: ${allCertsHash}`,
        'exec > >(tee /var/log/user-data.log) 2>&1',
        'set -ex',
        '',
        '# ===========================================',
        '# Install packages',
        '# ===========================================',
        'dnf install -y python3 python3-pip git jq',
        '',
        '# ===========================================',
        '# Clone Django app',
        '# ===========================================',
        'cd /opt && git clone --depth 1 https://github.com/rabbitmq/rabbitmq-server.git',
        '',
        '# ===========================================',
        '# Install Python packages',
        '# ===========================================',
        'pip3 install django gunicorn',
        '',
        '# ===========================================',
        '# Configure Django',
        '# ===========================================',
        'DJANGO_SECRET=$(openssl rand -hex 25)',
        `cd ${djangoDir}`,
        'sed -i "s/SECRET_KEY = .*/SECRET_KEY = \'$DJANGO_SECRET\'/" rabbitmq_auth_backend_django/settings.py',
        'sed -i "s/ALLOWED_HOSTS = .*/ALLOWED_HOSTS = [\'*\']/" rabbitmq_auth_backend_django/settings.py',
        '',
        '# ===========================================',
        '# Fix permissions for SQLite database',
        '# ===========================================',
        `chmod 777 ${djangoDir}`,
        `chmod 666 ${djangoDir}/db.sqlite3 2>/dev/null || true`,
        '',
        '# ===========================================',
        '# Run Django migrations',
        '# ===========================================',
        'python3 manage.py migrate',
        `chmod 666 ${djangoDir}/db.sqlite3`,
        '',
        '# ===========================================',
        '# Create Django users',
        '# ===========================================',
        `export CONSOLE_PASS=$(aws secretsmanager get-secret-value --secret-id ${consolePassword.secretArn} --query SecretString --output text --region ${this.region})`,
        `export AMQP_PASS=$(aws secretsmanager get-secret-value --secret-id ${amqpPassword.secretArn} --query SecretString --output text --region ${this.region})`,
        '',
        "python3 manage.py shell <<'PYEOF'",
        'import os',
        'from django.contrib.auth.models import User',
        '',
        'console_pass = os.environ["CONSOLE_PASS"]',
        'amqp_pass = os.environ["AMQP_PASS"]',
        '',
        '# RabbitMqConsoleUser (regular user -> "management" tag)',
        'if not User.objects.filter(username="RabbitMqConsoleUser").exists():',
        '    User.objects.create_user("RabbitMqConsoleUser", password=console_pass)',
        '    print("Created RabbitMqConsoleUser")',
        '',
        '# RabbitMqAmqpUser (superuser -> "administrator" tag)',
        'if not User.objects.filter(username="RabbitMqAmqpUser").exists():',
        '    User.objects.create_superuser("RabbitMqAmqpUser", email="", password=amqp_pass)',
        '    print("Created RabbitMqAmqpUser")',
        '',
        'print("All users:")',
        'for u in User.objects.all():',
        '    tag = "administrator" if u.is_superuser else "management"',
        '    print(f"  {u.username} -> {tag}")',
        'PYEOF',
        '',
        '# ===========================================',
        '# Modify views.py to support POST requests',
        '# ===========================================',
        'cat > rabbitmq_auth_backend_django/auth/views.py <<"VIEWSEOF"',
        'from django.http import HttpResponse',
        'from django.contrib.auth import authenticate',
        'from django.views.decorators.csrf import csrf_exempt',
        'import logging',
        '',
        'logger = logging.getLogger("auth_backend")',
        '',
        '@csrf_exempt',
        'def user(request):',
        '    username = request.GET.get("username") or request.POST.get("username")',
        '    password = request.GET.get("password") or request.POST.get("password")',
        '    if username and password:',
        '        if username == "admin":',
        '            return HttpResponse("allow administrator")',
        '        if username == "someuser":',
        '            return HttpResponse("allow")',
        '        user = authenticate(username=username, password=password)',
        '        if user:',
        '            if user.is_superuser:',
        '                return HttpResponse("allow administrator")',
        '            else:',
        '                return HttpResponse("allow management")',
        '    return HttpResponse("deny")',
        '',
        '@csrf_exempt',
        'def vhost(request):',
        '    return HttpResponse("allow")',
        '',
        '@csrf_exempt',
        'def resource(request):',
        '    return HttpResponse("allow")',
        '',
        '@csrf_exempt',
        'def topic(request):',
        '    return HttpResponse("allow")',
        'VIEWSEOF',
        '',
        '# ===========================================',
        '# Create Gunicorn systemd service',
        '# ===========================================',
        'cat > /etc/systemd/system/gunicorn.service <<EOF',
        '[Unit]',
        'Description=Gunicorn Django Server',
        'After=network.target',
        '',
        '[Service]',
        `WorkingDirectory=${djangoDir}`,
        'ExecStart=/usr/local/bin/gunicorn rabbitmq_auth_backend_django.wsgi:application --bind 0.0.0.0:8000 --workers 3',
        'Restart=always',
        '',
        '[Install]',
        'WantedBy=multi-user.target',
        'EOF',
        '',
        '# ===========================================',
        '# Start services',
        '# ===========================================',
        'systemctl daemon-reload',
        'systemctl enable --now gunicorn',
        '',
        '# ===========================================',
        '# Verify services',
        '# ===========================================',
        'sleep 3',
        'curl -s "http://localhost:8000/auth/user?username=admin&password=x" || echo "Auth check failed"',
        '',
        'echo "==========================================="',
        'echo "Setup complete!"',
        'echo "==========================================="'
    );

    // ===========================================
    // EC2 Instance
    // ===========================================
    const instance = new ec2.Instance(this, 'Instance', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      securityGroup: ec2Sg,
      role,
      userData,
      userDataCausesReplacement: true
    });

    instance.node.addDependency(certDeployment);

    // ===========================================
    // Security Group for ALB
    // ===========================================
    const albSg = new ec2.SecurityGroup(this, 'ALBSecurityGroup', {
      vpc,
      allowAllOutbound: true,
      description: 'Security group for ALB'
    });
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));

    ec2Sg.connections.allowFrom(albSg, ec2.Port.tcp(8000));

    // ===========================================
    // Application Load Balancer with mTLS
    // ===========================================
    const alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc,
      internetFacing: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: albSg
    });

    const listener = alb.addListener('Listener', {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [elbv2.ListenerCertificate.fromArn(props.serverCertificateArn)],
    });

    const cfnListener = listener.node.defaultChild as elbv2.CfnListener;
    cfnListener.mutualAuthentication = {
      mode: 'verify',
      trustStoreArn: trustStore.attrTrustStoreArn,
    };
    cfnListener.addDependency(trustStore);

    // Ensure listener waits for trust store refresh
    listener.node.addDependency(refreshTrustStore);

    listener.addTargets('Target', {
      port: 8000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [new elbv2_targets.InstanceTarget(instance, 8000)],
      healthCheck: {
        path: '/auth/user',
        interval: cdk.Duration.seconds(30),
      }
    });

    // ===========================================
    // IAM Role for Amazon MQ
    // ===========================================
    const amazonMqAssumeRole = new iam.Role(this, 'AmazonMqAssumeRole', {
      roleName: `AmazonMqAssumeRole-${stableSuffix}`,
      assumedBy: new iam.CompositePrincipal(
          new iam.ServicePrincipal('mq.amazonaws.com', {
            conditions: {
              StringEquals: { 'aws:SourceAccount': this.account },
              ArnLike: { 'aws:SourceArn': `arn:aws:mq:${this.region}:${this.account}:broker:*` }
            }
          }),
          new iam.ServicePrincipal('mq.aws.internal'),
          new iam.ServicePrincipal('developer.mq.aws.internal')
      )
    });

    certBucket.grantRead(amazonMqAssumeRole);
    clientKeySecret.grantRead(amazonMqAssumeRole);
    consolePassword.grantRead(amazonMqAssumeRole);
    amqpPassword.grantRead(amazonMqAssumeRole);

    // ===========================================
    // Outputs
    // ===========================================
    new cdk.CfnOutput(this, 'HttpAuthUserPath', {
      value: `https://${alb.loadBalancerDnsName}/auth/user`,
      description: 'auth_http.user_path',
      exportName: `${this.stackName}-HttpAuthUserPath`,
    });

    new cdk.CfnOutput(this, 'HttpAuthVhostPath', {
      value: `https://${alb.loadBalancerDnsName}/auth/vhost`,
      description: 'auth_http.vhost_path',
      exportName: `${this.stackName}-HttpAuthVhostPath`,
    });

    new cdk.CfnOutput(this, 'HttpAuthResourcePath', {
      value: `https://${alb.loadBalancerDnsName}/auth/resource`,
      description: 'auth_http.resource_path',
      exportName: `${this.stackName}-HttpAuthResourcePath`,
    });

    new cdk.CfnOutput(this, 'HttpAuthTopicPath', {
      value: `https://${alb.loadBalancerDnsName}/auth/topic`,
      description: 'auth_http.topic_path',
      exportName: `${this.stackName}-HttpAuthTopicPath`,
    });

    new cdk.CfnOutput(this, 'CaCertArn', {
      value: `${certBucket.bucketArn}/ca-cert.pem`,
      description: 'aws.arns.auth_http.ssl_options.cacertfile',
      exportName: `${this.stackName}-CaCertArn`,
    });

    new cdk.CfnOutput(this, 'ClientCertArn', {
      value: `${certBucket.bucketArn}/client-cert.pem`,
      description: 'aws.arns.auth_http.ssl_options.certfile',
      exportName: `${this.stackName}-ClientCertArn`,
    });

    new cdk.CfnOutput(this, 'ClientKeyArn', {
      value: clientKeySecret.secretArn,
      description: 'aws.arns.auth_http.ssl_options.keyfile',
      exportName: `${this.stackName}-ClientKeyArn`,
    });

    new cdk.CfnOutput(this, 'AmazonMqAssumeRoleArn', {
      value: amazonMqAssumeRole.roleArn,
      description: 'aws.arns.assume_role_arn',
      exportName: `${this.stackName}-AmazonMqAssumeRoleArn`,
    });

    new cdk.CfnOutput(this, 'ConsoleUserPasswordArn', {
      value: consolePassword.secretArn,
      description: 'Password for RabbitMqConsoleUser (management tag)',
      exportName: `${this.stackName}-ConsoleUserPasswordArn`,
    });

    new cdk.CfnOutput(this, 'AmqpUserPasswordArn', {
      value: amqpPassword.secretArn,
      description: 'Password for RabbitMqAmqpUser (administrator tag)',
      exportName: `${this.stackName}-AmqpUserPasswordArn`,
    });

    new cdk.CfnOutput(this, 'SslOptionsSni', {
      value: 'test.amazonaws.com',
      description: 'auth_http.ssl_options.sni',
      exportName: `${this.stackName}-SslOptionsSni`,
    });
  }
}