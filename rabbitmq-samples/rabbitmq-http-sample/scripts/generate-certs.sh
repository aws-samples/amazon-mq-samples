#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CERTS_DIR="$PROJECT_ROOT/certs"

mkdir -p "$CERTS_DIR"
cd "$CERTS_DIR"

# CA certificate
openssl genrsa -out ca-key.pem 2048
openssl req -new -x509 -days 3650 -key ca-key.pem -out ca-cert.pem -subj "/CN=RabbitMQ-HTTP-Auth-CA"

# Server certificate with wildcard ELB domain
openssl genrsa -out server-key.pem 2048

cat > server.conf <<EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = test.amazonaws.com

[v3_req]
subjectAltName = @alt_names
extendedKeyUsage = serverAuth

[alt_names]
DNS.1 = test.amazonaws.com
EOF

openssl req -new -key server-key.pem -out server.csr -config server.conf
openssl x509 -req -in server.csr -CA ca-cert.pem -CAkey ca-key.pem -CAcreateserial \
    -out server-cert.pem -days 3650 -extensions v3_req -extfile server.conf

# Client certificate
openssl genrsa -out client-key.pem 2048

cat > client.conf <<EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = RabbitMQ-Client

[v3_req]
extendedKeyUsage = clientAuth
EOF

openssl req -new -key client-key.pem -out client.csr -config client.conf
openssl x509 -req -in client.csr -CA ca-cert.pem -CAkey ca-key.pem -CAcreateserial \
    -out client-cert.pem -days 3650 -extensions v3_req -extfile client.conf

rm -f *.csr *.conf *.srl

# Verify SAN is correct
echo "Server certificate SAN:"
openssl x509 -in server-cert.pem -noout -text | grep -A5 "Subject Alternative Name"

echo "Certificates generated in $CERTS_DIR/"