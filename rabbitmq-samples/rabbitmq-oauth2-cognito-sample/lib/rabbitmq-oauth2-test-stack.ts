import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as cr from 'aws-cdk-lib/custom-resources';

export enum RabbitMQOAuthScope {
  READALL = 'read:all',
  WRITEALL = 'write:all',
  CONFIGUREALL = 'configure:all',
  TAGADMINISTRATOR = 'tag:administrator'
}

export interface OAuthTestStackProps extends cdk.StackProps {
  userPoolName: string;
  domainPrefix: string;
  callbackUrls?: string[];
  logoutUrls?: string[];
  managementConsoleTestUserPassword: string;
  managementConsoleTestUserName: string;
}

export class RabbitMqOAuth2TestStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolDomain: cognito.UserPoolDomain;
  public readonly amqpAppClient: cognito.UserPoolClient;
  public readonly managementConsoleAppClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: OAuthTestStackProps) {
    super(scope, id, props);

    if (!props.managementConsoleTestUserPassword) {
      throw new Error('managementConsoleTestUserPassword is required');
    }

    const defaultCallbackUrls = [`https://b-<your-broker-id>.${this.region}.on.aws/js/oidc-oauth/login-callback.html`];
    const defaultLogoutUrls = [`https://b-<your-broker-id>.${this.region}.on.aws/js/oidc-oauth/logout-callback.html`];

    const callbackUrls = props.callbackUrls || defaultCallbackUrls;
    const logoutUrls = props.logoutUrls || defaultLogoutUrls;

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: props.userPoolName,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    this.userPoolDomain = this.userPool.addDomain('UserPoolDomain', {
      cognitoDomain: {
        domainPrefix: `${props.domainPrefix}-${Math.random().toString(36).substring(2, 8)}`,
      },
    });

    const resourceServerIdentifier = 'rabbitmq';

    const resourceServerScopes: cognito.CfnUserPoolResourceServer.ResourceServerScopeTypeProperty[] = [
      {
        scopeName: RabbitMQOAuthScope.READALL,
        scopeDescription: 'Read permission for all vhosts and resources'
      },
      {
        scopeName: RabbitMQOAuthScope.WRITEALL,
        scopeDescription: 'Write permission for all vhosts and resources'
      },
      {
        scopeName: RabbitMQOAuthScope.CONFIGUREALL,
        scopeDescription: 'Configure permission for all vhosts and resources'
      },
      {
        scopeName: RabbitMQOAuthScope.TAGADMINISTRATOR,
        scopeDescription: 'Administrator tag permission'
      }
    ];

    const resourceServer = new cognito.CfnUserPoolResourceServer(this, 'RabbitMQResourceServer', {
      identifier: resourceServerIdentifier,
      name: resourceServerIdentifier,
      userPoolId: this.userPool.userPoolId,
      scopes: resourceServerScopes
    });

    const allowedScopes = [
      `${resourceServerIdentifier}/${RabbitMQOAuthScope.READALL}`,
      `${resourceServerIdentifier}/${RabbitMQOAuthScope.WRITEALL}`,
      `${resourceServerIdentifier}/${RabbitMQOAuthScope.CONFIGUREALL}`,
      `${resourceServerIdentifier}/${RabbitMQOAuthScope.TAGADMINISTRATOR}`
    ];

    this.amqpAppClient = this.userPool.addClient('RabbitMqAmqpAppClient', {
      userPoolClientName: 'RabbitMqAmqpAppClient',
      generateSecret: true,
      oAuth: {
        flows: {
          authorizationCodeGrant: false,
          implicitCodeGrant: false,
          clientCredentials: true,
        },
        scopes: allowedScopes.map(scope => cognito.OAuthScope.custom(scope)),
        callbackUrls: callbackUrls,
        logoutUrls: logoutUrls,
      }
    });

    this.managementConsoleAppClient = this.userPool.addClient('RabbitMqManagementConsoleAppClient', {
      userPoolClientName: 'RabbitMqManagementConsoleAppClient',
      generateSecret: false,
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false,
          clientCredentials: false,
        },
        scopes: allowedScopes.map(scope => cognito.OAuthScope.custom(scope)),
        callbackUrls: callbackUrls,
        logoutUrls: logoutUrls,
      }
    });

    this.amqpAppClient.node.addDependency(resourceServer);
    this.managementConsoleAppClient.node.addDependency(resourceServer);

    const testUser = new cognito.CfnUserPoolUser(this, 'ManagementConsoleTestUser', {
      userPoolId: this.userPool.userPoolId,
      username: props.managementConsoleTestUserName,
      messageAction: 'SUPPRESS'
    });

    new cr.AwsCustomResource(this, 'SetUserPassword', {
      onCreate: {
        service: 'CognitoIdentityServiceProvider',
        action: 'adminSetUserPassword',
        parameters: {
          UserPoolId: this.userPool.userPoolId,
          Username: props.managementConsoleTestUserName,
          Password: props.managementConsoleTestUserPassword,
          Permanent: true
        },
        physicalResourceId: cr.PhysicalResourceId.of('set-user-password')
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE
      })
    }).node.addDependency(testUser);

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'The ID of the Cognito User Pool',
      exportName: `${this.stackName}-UserPoolId`,
    });

    new cdk.CfnOutput(this, 'UserPoolDomainName', {
      value: this.userPoolDomain.domainName,
      description: 'The domain name of the Cognito User Pool',
      exportName: `${this.stackName}-UserPoolDomainName`,
    });

    new cdk.CfnOutput(this, 'AmqpAppClientId', {
      value: this.amqpAppClient.userPoolClientId,
      description: 'The ID of the Cognito User Pool Client for RabbitMQ',
      exportName: `${this.stackName}-AmqpAppClientId`,
    });

    new cdk.CfnOutput(this, 'AmqpAppClientSecret', {
      value: this.amqpAppClient.userPoolClientSecret.unsafeUnwrap(),
      description: 'The secret of the Cognito User Pool Client for RabbitMQ',
      exportName: `${this.stackName}-AmqpAppClientSecret`,
    });

    new cdk.CfnOutput(this, 'ManagementConsoleAppClientId', {
      value: this.managementConsoleAppClient.userPoolClientId,
      description: 'The ID of the Management Console App Client',
      exportName: `${this.stackName}-ManagementConsoleAppClientId`,
    });

    new cdk.CfnOutput(this, 'JwksUri', {
      value: `https://cognito-idp.${this.region}.amazonaws.com/${this.userPool.userPoolId}/.well-known/jwks.json`,
      description: 'JWKS URI for token validation',
      exportName: `${this.stackName}-JwksUri`,
    });

    new cdk.CfnOutput(this, 'TokenEndpoint', {
      value: `https://${this.userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com/oauth2/token`,
      description: 'OAuth2 token endpoint',
      exportName: `${this.stackName}-TokenEndpoint`,
    });

    new cdk.CfnOutput(this, 'Issuer', {
      value: `https://cognito-idp.${this.region}.amazonaws.com/${this.userPool.userPoolId}`,
      description: 'OAuth2 issuer URL',
      exportName: `${this.stackName}-Issuer`,
    });
  }
}
