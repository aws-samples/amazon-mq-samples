import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as fs from 'fs';
import * as path from 'path';

export interface RabbitMqSslStackProps extends cdk.StackProps {
}

export class RabbitMqSslStack extends cdk.Stack {
  public readonly caCertBucket: s3.Bucket;
  public readonly amazonMqAssumeRole: iam.Role;

  constructor(scope: Construct, id: string, props: RabbitMqSslStackProps) {
    super(scope, id, props);

    // Read certificate files
    const certPath = path.join(__dirname, '..', 'certs');
    const caCert = fs.readFileSync(path.join(certPath, 'ca-cert.pem'), 'utf8');

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
            'aws:SourceArn': `arn:aws:mq:${this.region}:${this.account}:broker:rabbitmq-mtls-test-*`,
          },
        },
      }),
      description: 'IAM role for Amazon MQ to access S3 and Secrets Manager',
    });

    // Grant S3 read access to the role
    this.caCertBucket.grantRead(this.amazonMqAssumeRole);

    // Output important values
    // RabbitMQ LDAP Configuration
    new cdk.CfnOutput(this, 'CaCertArn', {
      value: `${this.caCertBucket.bucketArn}/ca-cert.pem`,
      description: 'S3 object ARN for issuer certificate used to validate the client certificate',
    });

    new cdk.CfnOutput(this, 'AmazonMqAssumeRoleArn', {
      value: this.amazonMqAssumeRole.roleArn,
      description: 'IAM role ARN that Amazon MQ assumes to retrieve CaCertArn',
    });
  }
}
