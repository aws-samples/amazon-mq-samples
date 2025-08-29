#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { RabbitMqOAuth2TestStack } from '../lib/rabbitmq-oauth2-test-stack';

const app = new cdk.App();

const managementConsoleTestUserPassword = process.env.RABBITMQ_OAUTH2_MANAGEMENT_CONSOLE_TEST_USER_PASSWORD;
const managementConsoleTestUserName = process.env.RABBITMQ_OAUTH2_MANAGEMENT_CONSOLE_TEST_USER_NAME;
const callbackUrls = process.env.RABBITMQ_OAUTH2_CALLBACK_URLS ? process.env.RABBITMQ_OAUTH2_CALLBACK_URLS.split(',') : undefined;
const logoutUrls = process.env.RABBITMQ_OAUTH2_LOGOUT_URLS ? process.env.RABBITMQ_OAUTH2_LOGOUT_URLS.split(',') : undefined;

if (!managementConsoleTestUserPassword) {
  throw new Error('RABBITMQ_OAUTH2_MANAGEMENT_CONSOLE_TEST_USER_PASSWORD environment variable is required');
}

if (!managementConsoleTestUserName) {
  throw new Error('RABBITMQ_OAUTH2_MANAGEMENT_CONSOLE_TEST_USER_NAME environment variable is required');
}

new RabbitMqOAuth2TestStack(app, 'RabbitMqOAuth2TestStack', {
  userPoolName: 'RabbitMqOAuth2TestUserPool',
  domainPrefix: 'rabbitmq-oauth2-test',
  callbackUrls,
  logoutUrls,
  managementConsoleTestUserPassword,
  managementConsoleTestUserName,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
