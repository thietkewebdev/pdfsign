#!/usr/bin/env bash
# Test PKI for B-LT/B-LTA: Root CA, signer, TSA and OCSP responder certificates whose
# AIA (caIssuers + OCSP) and CRL distribution points point at scripts/pki_services.py on 127.0.0.1.
# TEST ONLY: keys are public in the repo.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=tests/fixtures/pki-ltv
rm -rf "$OUT" && mkdir -p "$OUT" && cd "$OUT"
HTTP=http://127.0.0.1:18080
OCSP=http://127.0.0.1:18081

mkdir -p newcerts && : > index.txt && echo 1000 > serial && echo 1000 > crlnumber
cat > ca.cnf <<EOF
[ca]
default_ca = test_ca
[test_ca]
dir = .
database = ./index.txt
new_certs_dir = ./newcerts
serial = ./serial
crlnumber = ./crlnumber
certificate = ./ca.cert.pem
private_key = ./ca.key.pem
default_md = sha256
default_days = 3650
default_crl_days = 30
policy = any
copy_extensions = none
unique_subject = no
[any]
countryName = optional
localityName = optional
organizationName = optional
commonName = supplied
[req]
distinguished_name = dn
prompt = no
utf8 = yes
string_mask = utf8only
[dn]
C = VN
O = PDFSign LTV Test CA (KHONG TIN CAY)
CN = PDFSign LTV Test Root CA
[v3_ca]
basicConstraints = critical, CA:true
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
[aia]
authorityInfoAccess = caIssuers;URI:$HTTP/ca.cert.der, OCSP;URI:$OCSP
crlDistributionPoints = URI:$HTTP/ca.crl
[v3_signer]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature, nonRepudiation
extendedKeyUsage = clientAuth, emailProtection
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid
authorityInfoAccess = caIssuers;URI:$HTTP/ca.cert.der, OCSP;URI:$OCSP
crlDistributionPoints = URI:$HTTP/ca.crl
[v3_tsa]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature, nonRepudiation
extendedKeyUsage = critical, timeStamping
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid
authorityInfoAccess = caIssuers;URI:$HTTP/ca.cert.der, OCSP;URI:$OCSP
crlDistributionPoints = URI:$HTTP/ca.crl
[v3_ocsp]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, OCSPSigning
noCheck = ignored
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid
EOF

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out ca.key.pem 2>/dev/null
openssl req -new -x509 -config ca.cnf -extensions v3_ca -key ca.key.pem -days 7300 -sha256 -out ca.cert.pem
openssl x509 -in ca.cert.pem -outform DER -out ca.cert.der

issue() { # name subject extensions
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$1.key.pem" 2>/dev/null
  openssl req -new -key "$1.key.pem" -subj "$2" -utf8 -out "$1.csr"
  openssl ca -batch -config ca.cnf -extensions "$3" -in "$1.csr" -out "$1.cert.pem" -notext -utf8 2>/dev/null
  openssl x509 -in "$1.cert.pem" -outform DER -out "$1.cert.der"
  rm -f "$1.csr"
}
issue signer "/C=VN/O=CÔNG TY TNHH THỬ NGHIỆM LTV/CN=Trần Thị Kiểm Thử" v3_signer
issue tsa "/C=VN/O=PDFSign LTV Test CA (KHONG TIN CAY)/CN=PDFSign Test TSA" v3_tsa
issue ocsp "/C=VN/O=PDFSign LTV Test CA (KHONG TIN CAY)/CN=PDFSign Test OCSP Responder" v3_ocsp

cat > tsa.cnf <<'EOF'
[tsa]
default_tsa = tsa_config
[tsa_config]
dir = .
serial = ./tsaserial
crypto_device = builtin
signer_cert = ./tsa.cert.pem
certs = ./ca.cert.pem
signer_key = ./tsa.key.pem
signer_digest = sha256
default_policy = 1.3.6.1.4.1.99999.1
digests = sha256, sha384, sha512
accuracy = secs:1
ordering = no
tsa_name = no
ess_cert_id_chain = no
ess_cert_id_alg = sha256
EOF
echo 01 > tsaserial
echo "Generated LTV test PKI in $(pwd)"
