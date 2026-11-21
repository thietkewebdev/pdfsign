#!/usr/bin/env bash
# Generate a throwaway test CA + signer (RSA 2048) under tests/fixtures/pki.
# TEST ONLY: these keys are public in the repo and must never be trusted anywhere.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=tests/fixtures/pki
mkdir -p "$OUT"
cd "$OUT"

cat > ca.cnf <<'EOF'
[req]
distinguished_name = dn
prompt = no
utf8 = yes
string_mask = utf8only
[dn]
C = VN
O = PDFSign Test CA (KHONG TIN CAY)
CN = PDFSign Test Root CA
[v3_ca]
basicConstraints = critical, CA:true
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
EOF

cat > signer.cnf <<'EOF'
[req]
distinguished_name = dn
prompt = no
utf8 = yes
string_mask = utf8only
[dn]
C = VN
L = Hà Nội
O = CÔNG TY TNHH THỬ NGHIỆM PDFSIGN
CN = Nguyễn Văn Thử
[v3_signer]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature, nonRepudiation
extendedKeyUsage = clientAuth, emailProtection
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid
EOF

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out ca.key.pem
openssl req -new -x509 -config ca.cnf -extensions v3_ca -key ca.key.pem -days 7300 -sha256 -out ca.cert.pem

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out signer.key.pem
openssl req -new -config signer.cnf -key signer.key.pem -out signer.csr
openssl x509 -req -in signer.csr -CA ca.cert.pem -CAkey ca.key.pem -CAcreateserial \
  -days 3650 -sha256 -extfile signer.cnf -extensions v3_signer -out signer.cert.pem
rm -f signer.csr ca.cert.srl
openssl x509 -in signer.cert.pem -outform DER -out signer.cert.der
openssl x509 -in ca.cert.pem -outform DER -out ca.cert.der
openssl pkcs12 -export -inkey signer.key.pem -in signer.cert.pem -certfile ca.cert.pem \
  -name "test-signer" -passout pass:test1234 -out signer.p12
echo "Generated test PKI in $(pwd)"
