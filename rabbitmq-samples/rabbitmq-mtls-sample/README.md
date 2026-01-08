# Amazon MQ for RabbitMQ mTLS Sample CDK

This CDK project deploys the prerequisite AWS resources needed to test Amazon MQ for RabbitMQ mTLS or SSL feature as described in the [AWS documentation](https://docs.aws.amazon.com/amazon-mq/latest/developer-guide/rabbitmq-ldap-tutorial.html).

This stack creates the supporting infrastructure required before configuring Amazon MQ for RabbitMQ to use mTLS.

## Step 0: Prerequisites

1. AWS CDK CLI installed and configured.
2. CDK bootstrap completed in the target AWS account and region (`cdk bootstrap`).

## Step 1: Install dependencies

1. Navigate to the project directory:
   ```bash
   cd rabbitmq-mtls-sample
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Step 2: Set environment variable (optional)

If you plan to use mTLS for authentication through the [rabbitmq_auth_mechanism_ssl](https://github.com/rabbitmq/rabbitmq-server/blob/main/deps/rabbitmq_auth_mechanism_ssl/README.mdl) plugin, you must set this environment variable with your desired test user credentials before building or deploying.

```bash
export RABBITMQ_TEST_USER_NAME="your-username"
```

## Step 3: Build and deploy the stack

1. Build the project (this automatically generates certificates):
   ```bash
   npm run build
   ```

2. Deploy the CDK stack:
   ```bash
   cdk deploy
   ```

The deployment takes approximately 2-3 minutes.

## Step 4: Retrieve the outputs

Once deployment is complete, the stack will output values needed for configuring Amazon MQ for RabbitMQ broker as described in the [AWS tutorial](https://docs.aws.amazon.com/amazon-mq/latest/developer-guide/rabbitmq-mtls-tutorial.html):

### RabbitMQ mTLS Configuration
- **CaCertArn**: S3 object ARN for issuer certificate used to validate the client certificate
- **AmazonMqAssumeRoleArn**: IAM role ARN that Amazon MQ assumes to retrieve CaCertArn

## Security Restrictions

> [!IMPORTANT]
> **The IAM role (AmazonMqAssumeRoleArn stack output) includes security conditions that restrict access to:**
> - **Account**: Only Amazon MQ brokers in the same AWS account can assume the role (`aws:SourceAccount`)
> - **Region**: Only Amazon MQ brokers in the same AWS region as the stack can assume the role (`aws:SourceArn`)
> - **🚨 BROKER NAMING REQUIREMENT: Broker name MUST start with `rabbitmq-mtls-test-` to assume the role (`aws:SourceArn`) 🚨**
>
> **Note**: The broker naming restriction is included as an example of how to restrict where this role can be used within Amazon MQ, such as limiting access to brokers following a certain naming pattern.

## Certificate Generation

A CA certificate and client certificate are automatically generated via the `generate-certs.sh` prebuild script during deployment.

## Cleanup

To remove all resources created by this stack:

```bash
cdk destroy
```
