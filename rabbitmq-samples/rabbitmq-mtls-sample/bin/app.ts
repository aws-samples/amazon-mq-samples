#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { RabbitMqSslStack } from '../lib/rabbitmq-ssl-stack';

const app = new cdk.App();

new RabbitMqSslStack(app, 'RabbitMqSslTestStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
