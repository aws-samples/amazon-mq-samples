# Amazon MQ for RabbitMQ LDAP Integration With AWS Managed Microsoft Active Directory

This CDK project deploys the prerequisite AWS resources needed to test Amazon MQ for RabbitMQ LDAP feature as described in the [AWS documentation](https://docs.aws.amazon.com/amazon-mq/latest/developer-guide/rabbitmq-ldap-tutorial.html).

This stack creates the AWS Managed Microsoft Active Directory, LDAP users and groups, and supporting infrastructure required before configuring Amazon MQ for RabbitMQ with LDAP authentication and authorization.

## Step 0: Prerequisites

1. AWS CDK CLI installed and configured.
2. CDK bootstrap completed in the target AWS account and region (`cdk bootstrap`).

## Step 1: Install dependencies

1. Navigate to the project directory:
   ```bash
   cd rabbitmq-ldap-activedirectory-sample
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Step 2: Build and deploy the stack

1. Build the project (this automatically generates certificates):
   ```bash
   npm run build
   ```

2. Deploy the CDK stack:
   ```bash
   cdk deploy
   ```

The deployment takes approximately 20-30 minutes due to Active Directory setup.

## Step 3: Retrieve the outputs

Once deployment is complete, the stack will output values needed for configuring Amazon MQ for RabbitMQ broker as described in the [AWS tutorial](https://docs.aws.amazon.com/amazon-mq/latest/developer-guide/rabbitmq-ldap-tutorial.html):

### RabbitMQ LDAP Configuration
- **NlbDnsName**: Network Load Balancer DNS name for LDAPS connections (port 636)
- **CaCertArn**: S3 object ARN for issuer certificate used to validate the LDAP server certificate
- **AmazonMqAssumeRoleArn**: IAM role ARN that Amazon MQ assumes to retrieve DnLookupUserPasswordArn and CaCertArn
- **DnLookupUserDn**: Distinguished Name (DN) for DN lookup binding to resolve usernames to full DNs
- **DnLookupUserPasswordArn**: DN lookup user password (auto-generated, Secrets Manager ARN)
- **DnLookupBase**: LDAP DN lookup base (`DC=rabbitmq-ldap,DC=tutorial,DC=local`)
- **DnLookupAttribute**: LDAP attribute for username (defaults to `sAMAccountName`)
- **RabbitMqAdministratorsGroupDn**: Distinguished Name (DN) of RabbitMqAdministrators group for administrator permissions
- **RabbitMqMonitoringUsersGroupDn**: Distinguished Name (DN) of RabbitMqMonitoringUsers group for management console access

### RabbitMQ Management Console Access
- **ConsoleUserPasswordArn**: Console user password for `RabbitMqConsoleUser` (member of `RabbitMqMonitoringUsers` group, auto-generated, Secrets Manager ARN)

### AMQP Connection Access
- **AmqpUserPasswordArn**: AMQP user password for `RabbitMqAmqpUser` (member of `RabbitMqAdministrators` group, auto-generated, Secrets Manager ARN)

### General Stack Information
- **VpcId**: VPC ID with public/private subnets across 2 availability zones
- **ActiveDirectoryId**: AWS Managed Microsoft AD ID (`rabbitmq-ldap.tutorial.local` domain)
- **CertificateArn**: IAM Certificate ARN for `*.elb.{region}.amazonaws.com`
- **AdminPasswordArn**: Active Directory admin password (auto-generated, Secrets Manager ARN)

## Certificate Generation

A CA certificate and server certificate for `*.elb.{region}.amazonaws.com` are automatically generated via the `generate-certs.sh` prebuild script during deployment. The script detects the AWS region from `AWS_DEFAULT_REGION` environment variable.

## Users Created

The stack automatically creates three LDAP users in Active Directory:
- **RabbitMqDnLookupUser**: Used by RabbitMQ for DN lookup binding to resolve usernames to full Distinguished Names during authentication
- **RabbitMqConsoleUser**: Member of `RabbitMqMonitoringUsers` group for RabbitMQ management console access with monitoring permissions
- **RabbitMqAmqpUser**: Member of `RabbitMqAdministrators` group for AMQP connections with full administrative permissions

**Note**: The custom resource for user creation always reports success to avoid re-creating the Active Directory (which takes 20-30 minutes) if user creation fails. Check CloudWatch logs for the `CreateADUsersFunction` Lambda function if users are not created properly.

## Security Restrictions

The IAM role includes security conditions that restrict access to:
- **Account**: Only Amazon MQ brokers in the same AWS account can assume the role (`aws:SourceAccount`)
- **Region**: Only Amazon MQ brokers in the same AWS region as the stack can assume the role (`aws:SourceArn`)
- **Broker naming**: Broker name must start with `rabbitmq-ldap-test-` to assume the role (`aws:SourceArn`)

## Accessing RabbitMQ

Passwords can be retrieved using the AWS CLI with the secret ARNs provided in stack outputs. Sample RabbitMQ configuration and commands to call the management API with the retrieved passwords are provided in the [AWS tutorial](https://docs.aws.amazon.com/amazon-mq/latest/developer-guide/rabbitmq-ldap-tutorial.html).

## Cleanup

To remove all resources created by this stack:

```bash
cdk destroy
```

**Note**: If stack deletion fails due to the IAM certificate being in use by the Network Load Balancer, run `cdk destroy` a second time or force delete the stack from the AWS console. This is a known CloudFormation limitation with IAM certificates.
