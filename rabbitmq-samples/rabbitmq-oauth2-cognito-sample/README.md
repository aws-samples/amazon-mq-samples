# Amazon MQ for RabbitMQ OAuth2 Integration With Amazon Cogntio

This CDK project deploys the prerequisite AWS resources needed to test Amazon MQ for RabbitMQ OAuth2 feature as described in the [AWS documentation](https://docs.aws.amazon.com/amazon-mq/latest/developer-guide/oauth-tutorial.html).

This stack creates the Cognito User Pool and related OAuth2 resources required before configuring Amazon MQ for RabbitMQ with OAuth2 authentication and authorization.

## Step 0: Prerequisites

1. Access to an AWS account.
2. An AWS IAM user/Principal with the required permissions to deploy the infrastructure.
3. AWS CDK CLI installed and configured.

## Step 1: Install dependencies

1. Navigate to the project directory:
   ```bash
   cd rabbitmq-oauth2-cognito-sample
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Step 2: Set required environment variables

Before building or deploying, you must set these environment variables with your desired test user credentials:

```bash
export RABBITMQ_OAUTH2_MANAGEMENT_CONSOLE_TEST_USER_NAME="your-username"
export RABBITMQ_OAUTH2_MANAGEMENT_CONSOLE_TEST_USER_PASSWORD="your-password"
```

### Optional: Callback and Logout URLs

If you already have an existing RabbitMQ broker, you can specify the callback and logout URLs:

```bash
export RABBITMQ_OAUTH2_CALLBACK_URLS="https://b-your-broker-id.region.on.aws/js/oidc-oauth/login-callback.html"
export RABBITMQ_OAUTH2_LOGOUT_URLS="https://b-your-broker-id.region.on.aws/js/oidc-oauth/logout-callback.html"
```

For multiple brokers, separate URLs with commas:

```bash
export RABBITMQ_OAUTH2_CALLBACK_URLS="https://b-<broker-id-1>.<region>.on.aws/js/oidc-oauth/login-callback.html,https://b-<broker-id-2>.<region>.on.aws/js/oidc-oauth/login-callback.html"
export RABBITMQ_OAUTH2_LOGOUT_URLS="https://b-<broker-id-1>.<region>.on.aws/js/oidc-oauth/logout-callback.html,https://b-<broker-id-2>.<region>.on.aws/js/oidc-oauth/logout-callback.html"
```

If not provided, placeholder URLs will be used (see Step 5 to update them later).

### Password Requirements

The password must meet [Cognito's password policy requirements](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-policies.html):
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

## Step 3: Build and deploy the stack

1. Build the project:
   ```bash
   cdk synth
   ```

2. Deploy the CDK stack:

```bash
cdk deploy
```

The deployment takes approximately 2-3 minutes.

## Step 4: Retrieve the outputs

Once deployment is complete, the stack will output the following values needed for configuring a Amazon MQ for RabbitMQ broker:

- **UserPoolId**: The ID of the Cognito User Pool
- **AmqpAppClientId**: Client ID for AMQP connections
- **AmqpAppClientSecret**: Client secret for AMQP connections
- **ManagementConsoleAppClientId**: Client ID for RabbitMQ management console access (no secret)
- **JwksUri**: URI to fetch signing keys for token validation
- **Issuer**: URI of token issuer
- **TokenEndpoint**: Endpoint to fetch OAuth2 tokens

## Step 5: Update callback URLs (if using placeholder URLs)

If you didn't specify callback URLs in Step 2, you must update them after creating your RabbitMQ broker for management console OAuth2 login to work:

1. Create your RabbitMQ broker with OAuth2 configuration following the [AWS tutorial](https://docs.aws.amazon.com/amazon-mq/latest/developer-guide/oauth-tutorial.html)
2. Go to the Cognito console and select the **RabbitMqOAuth2TestUserPool** user pool
3. Navigate to **App clients** → **RabbitMqManagementConsoleAppClient** → **Login pages** → **Allowed callback URLs**
4. Replace the placeholder URLs with your actual broker URLs

## Resources Created

- **Cognito User Pool**: Manages user authentication and authorization
- **Cognito User Pool Domain**: Provides OAuth2 endpoints with unique identifier
- **Resource Server**: Defines RabbitMQ-specific OAuth2 scopes
- **AMQP App Client**: Configured for client credentials flow (with secret)
- **RabbitMQ Management Console App Client**: Configured for authorization code flow (no secret)
- **Test User for Management Console**: Created with specified username and password
- **Cognito OAuth2 Custom Scopes**:
  - `rabbitmq/read:all` - Read permission for all vhosts and queues (corresponds to rabbitmq.read:*/*)
  - `rabbitmq/write:all` - Write permission for all vhosts and queues (corresponds to rabbitmq.write:*/*)
  - `rabbitmq/configure:all` - Configure permission for all vhosts and queues (corresponds to rabbitmq.configure:*/*)
  - `rabbitmq/tag:administrator` - Administrator permissions

## Cleanup

To remove all resources created by this stack:

```bash
cdk destroy
```
