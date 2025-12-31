#!/bin/bash

set -e

CERT_DIR="./certs"
CLIENT_CN=${RABBITMQ_TEST_USER_NAME:-TestClient}
CLIENT_KEYSTORE_PASSWORD=${CLIENT_KEYSTORE_PASSWORD:-changeit}

mkdir -p $CERT_DIR

# Generate CA
/usr/bin/openssl genrsa -out $CERT_DIR/ca-private-key.pem 2048
/usr/bin/openssl req -new -x509 -days 365 -key $CERT_DIR/ca-private-key.pem -out $CERT_DIR/ca-cert.pem -subj "/CN=RabbitMQ-MTLS-TestCA"

# Generate client cert
/usr/bin/openssl genrsa -out $CERT_DIR/client-private-key.pem 2048
/usr/bin/openssl req -new -key $CERT_DIR/client-private-key.pem -out $CERT_DIR/client.csr -subj "/CN=${CLIENT_CN}"
/usr/bin/openssl x509 -req -in $CERT_DIR/client.csr -CA $CERT_DIR/ca-cert.pem -CAkey $CERT_DIR/ca-private-key.pem -CAcreateserial -out $CERT_DIR/client-cert.pem -days 365 -extensions v3_req -extfile <(echo -e "[ v3_req ]\nkeyUsage = digitalSignature, keyEncipherment\nextendedKeyUsage = clientAuth")
/usr/bin/openssl pkcs12 -export -in $CERT_DIR/client-cert.pem -inkey $CERT_DIR/client-private-key.pem -out $CERT_DIR/client-keystore.p12 -password pass:${CLIENT_KEYSTORE_PASSWORD}
rm $CERT_DIR/client.csr

echo "Client cert CN: ${CLIENT_CN}"
echo ""
echo "Files in certs/ directory:"
echo "- ca-cert.pem (CA certificate - upload to S3)"
echo "- ca-private-key.pem (CA private key)"
echo "- client-cert.pem (client certificate)"
echo "- client-private-key.pem (client private key)"
echo "- client-keystore.p12 (client keystore)"
