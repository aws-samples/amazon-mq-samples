#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { RabbitMqHttpTestStack } from '../lib/rabbitmq-http-test-stack';
import { execSync } from 'child_process';
import * as path from 'path';

const region = process.env.CDK_DEFAULT_REGION || execSync('aws configure get region', { encoding: 'utf-8' }).trim();

const certsDir = path.join(__dirname, '../certs');
const certFile = path.join(certsDir, 'server-cert.pem');
const keyFile = path.join(certsDir, 'server-key.pem');
const caFile = path.join(certsDir, 'ca-cert.pem');

console.log('Generating certificates...');
execSync(`bash scripts/generate-certs.sh ${region}`, { stdio: 'inherit', cwd: path.join(__dirname, '..') });

let certificateArn: string;
console.log(`Using region: ${region}`);

try {
  const result = execSync(
    `aws acm import-certificate --certificate fileb://${certFile} --private-key fileb://${keyFile} --certificate-chain fileb://${caFile} --region ${region} --query CertificateArn --output text`,
    { encoding: 'utf-8' }
  );
  certificateArn = result.trim();
  console.log(`Certificate uploaded to ACM: ${certificateArn}`);
} catch (error: any) {
  if (error.stderr?.includes('already exists')) {
    const listResult = execSync(
      `aws acm list-certificates --region ${region} --query "CertificateSummaryList[?DomainName=='test.amazonaws.com'].CertificateArn" --output text`,
      { encoding: 'utf-8' }
    );
    certificateArn = listResult.trim();
    console.log(`Using existing certificate: ${certificateArn}`);
  } else {
    throw error;
  }
}

const app = new cdk.App();

new RabbitMqHttpTestStack(app, 'RabbitMqHttpAuthElbStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: region
  },
  serverCertificateArn: certificateArn
});
