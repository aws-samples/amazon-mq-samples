#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { RabbitMqActiveDirectoryStack } from '../lib/rabbitmq-activedirectory-stack';

const app = new cdk.App();

new RabbitMqActiveDirectoryStack(app, 'RabbitMqLdapTestStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
