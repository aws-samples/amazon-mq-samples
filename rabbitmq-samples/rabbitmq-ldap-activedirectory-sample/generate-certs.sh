#!/bin/bash

set -e

CERT_DIR="./certs"
REGION=${AWS_DEFAULT_REGION:-us-east-1}

mkdir -p $CERT_DIR

# Generate CA
/usr/bin/openssl genrsa -out $CERT_DIR/ca-private-key.pem 2048
/usr/bin/openssl req -new -x509 -days 365 -key $CERT_DIR/ca-private-key.pem -out $CERT_DIR/ca-cert.pem -subj "/CN=RabbitMQ-LDAP-TestCA"

# Generate server cert for ELB with region-specific domain
/usr/bin/openssl genrsa -out $CERT_DIR/server-private-key.pem 2048
/usr/bin/openssl req -new -key $CERT_DIR/server-private-key.pem -out $CERT_DIR/server.csr -subj "/CN=*.elb.${REGION}.amazonaws.com"
/usr/bin/openssl x509 -req -in $CERT_DIR/server.csr -CA $CERT_DIR/ca-cert.pem -CAkey $CERT_DIR/ca-private-key.pem -CAcreateserial -out $CERT_DIR/server-cert.pem -days 365
rm $CERT_DIR/server.csr

echo "Certificates generated for region: $REGION"
echo "Server cert CN: *.elb.${REGION}.amazonaws.com"
echo ""
echo "Files in certs/ directory:"
echo "- ca-cert.pem (CA certificate - upload to S3)"
echo "- ca-private-key.pem (CA private key)"
echo "- server-cert.pem (server certificate - import to IAM)"
echo "- server-private-key.pem (server private key - import to IAM)"
