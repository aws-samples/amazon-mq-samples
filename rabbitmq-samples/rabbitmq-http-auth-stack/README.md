# RabbitMQ HTTP Authentication Backend with mTLS

CDK stack deploying Django-based HTTP authentication backend for RabbitMQ with mutual TLS using Application Load Balancer.

## Architecture

```
RabbitMQ → [mTLS] → ALB (HTTPS:443 with mTLS) → EC2 → Gunicorn → Django → SQLite
```


## Deployment

### Step 0: Prerequisites
- AWS CDK CLI installed and configured
- CDK bootstrap completed in the target AWS account and region (`cdk bootstrap`)

### Step 1: Install dependencies
Navigate to the project directory:
```bash
cd rabbitmq-http-auth-stack
```

Install dependencies:
```bash
npm install
```

### Step 2: Build and deploy the stack
Set your AWS region (required for certificate generation):
```bash
export AWS_DEFAULT_REGION=us-west-2
```

Build the project (this automatically generates certificates):
```bash
npm run build
```

Deploy the CDK stack:
```bash
cdk deploy
```

The deployment takes approximately 5 minutes for EC2 initialization.

## Stack Outputs

Once deployment is complete, the stack will output values needed for configuring Amazon MQ for RabbitMQ broker:

**RabbitMQ HTTP Authentication Configuration**
- **ssl_options.sni**: Please add `auth_http.ssl_options.sni=test.amazonaws.com` to RabbitMQ config to make this test stack work.
- **HttpAuthUserPath**: Full URL for user authentication endpoint
- **HttpAuthVhostPath**: Full URL for vhost authorization endpoint
- **HttpAuthResourcePath**: Full URL for resource authorization endpoint
- **HttpAuthTopicPath**: Full URL for topic authorization endpoint
- **CaCertArn**: S3 object ARN for CA certificate used to validate the HTTP auth backend certificate
- **ClientCertArn**: S3 object ARN for client certificate used by RabbitMQ to authenticate to HTTP backend
- **ClientKeyArn**: Secrets Manager ARN for client private key
- **AmazonMqAssumeRoleArn**: IAM role ARN that Amazon MQ assumes to retrieve certificates and secrets

**User Credentials**
- **ConsoleUserPasswordArn**: Password for RabbitMqConsoleUser (management tag, auto-generated, Secrets Manager ARN)
- **AmqpUserPasswordArn**: Password for RabbitMqAmqpUser (administrator tag, auto-generated, Secrets Manager ARN)
## Certificate Generation

- **CA certificate**: Self-signed CA for issuing server and client certificates
- **Server certificate**: CN=test.amazonaws.com with SAN=test.amazonaws.com (uploaded to ACM)
- **Client certificate**: CN=RabbitMQ-Client with clientAuth extended key usage
- The SAN of Server Certificate is hard-coded for now because of a bug in `hostname_verification` step in the HTTP plugin. The fix will be included in the next patch. For now, the user needs to add `auth_http.ssl_options.sni=test.amazonaws.com` to their RabbitMQ config to make this stack work properly.
- Automatically uploaded to ACM during deployment
- Reuses existing certificate if already present in ACM

## Users Created

The stack automatically creates two Django users:
- **RabbitMqConsoleUser**: Regular user with management tag for console access
- **RabbitMqAmqpUser**: Superuser with administrator tag for full administrative permissions
- **admin**: Default Django superuser (accepts any password, for testing only)

## Accessing RabbitMQ

Passwords can be retrieved using the AWS CLI:

```bash
aws secretsmanager get-secret-value --secret-id <PasswordArn> --query SecretString --output text
```


## Test

```bash
# Get password from Secrets Manager
CONSOLE_PASS=$(aws secretsmanager get-secret-value --secret-id <ConsoleUserPasswordArn> --query SecretString --output text)

# Test authentication with mTLS
curl --cacert certs/ca-cert.pem \
     --cert certs/client-cert.pem \
     --key certs/client-key.pem \
     "https://<ALB-DNS>/auth/user" \
     -d "username=RabbitMqConsoleUser&password=$CONSOLE_PASS"
```
## Cleanup

To remove all resources:

```bash
cdk destroy
```
