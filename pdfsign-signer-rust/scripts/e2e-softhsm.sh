#!/usr/bin/env bash
# End-to-end tests through a real PKCS#11 module (SoftHSM2) and local PKI services (TSA, OCSP,
# CRL, AIA). No hardware token or internet needed.
# Requires: softhsm2-util, pkcs11-tool (OpenSC), openssl, python3.
# Optional: pyhanko (CLI), pdfsig, pdftoppm, qpdf; LTV_PYTHON = python with pyHanko <= 0.29 for
#           the legacy PAdES-LT/LTA validator (scripts/pyhanko_ltv_check.py).
# Usage: scripts/e2e-softhsm.sh [OUT_DIR]   (env PDFSIGN_BIN to use a prebuilt binary)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/target/e2e}"
rm -rf "$OUT" && mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
PKI="$ROOT/tests/fixtures/pki-ltv"
FIX="$ROOT/tests/fixtures"
BIN="${PDFSIGN_BIN:-$ROOT/target/debug/pdfsign}"
[ -x "$BIN" ] || (cd "$ROOT" && cargo build -p pdfsign-cli)
TSA=http://127.0.0.1:18080/tsa
export PDFSIGN_CONFIG_DIR="$OUT/config"

MODULE="${SOFTHSM2_MODULE:-}"
for cand in /usr/lib/softhsm/libsofthsm2.so /usr/lib/x86_64-linux-gnu/softhsm/libsofthsm2.so \
  /opt/homebrew/lib/softhsm/libsofthsm2.so /usr/local/lib/softhsm/libsofthsm2.so; do
  [ -z "$MODULE" ] && [ -f "$cand" ] && MODULE="$cand"
done
[ -n "$MODULE" ] || { echo "SoftHSM2 module not found (set SOFTHSM2_MODULE)"; exit 1; }

SERVICES_PID=""
if ! curl -s -m 2 -o /dev/null http://127.0.0.1:18080/ca.crl; then
  python3 "$ROOT/scripts/pki_services.py" "$PKI" > "$OUT/pki-services.log" 2>&1 &
  SERVICES_PID=$!
  for _ in $(seq 1 30); do curl -s -m 1 -o /dev/null http://127.0.0.1:18080/ca.crl && break; sleep 0.3; done
fi
TOKDIR="$(mktemp -d)"
cleanup() { rm -rf "$TOKDIR"; [ -n "$SERVICES_PID" ] && kill "$SERVICES_PID" 2>/dev/null || true; }
trap cleanup EXIT

export SOFTHSM2_CONF="$TOKDIR/softhsm2.conf"
printf 'directories.tokendir = %s\nobjectstore.backend = file\nlog.level = ERROR\n' "$TOKDIR" > "$SOFTHSM2_CONF"
PIN=123456
LABEL="PDFSIGN-TEST"

echo "== init SoftHSM2 token ($MODULE): signer key + cert only, CA comes from AIA"
softhsm2-util --init-token --free --label "$LABEL" --pin "$PIN" --so-pin 12345678 >/dev/null
softhsm2-util --import "$PKI/signer.key.pem" --token "$LABEL" --label "Tran Thi Kiem Thu" --id 01 --pin "$PIN" >/dev/null
pkcs11-tool --module "$MODULE" --token-label "$LABEL" --login --pin "$PIN" \
  --write-object "$PKI/signer.cert.der" --type cert --id 01 --label "Tran Thi Kiem Thu" >/dev/null

sign() { echo "$PIN" | "$BIN" sign --module "$MODULE" --pin-stdin "$@"; }

"$BIN" list-tokens --module "$MODULE" | tee "$OUT/list-tokens.txt"
"$BIN" list-certs --module "$MODULE" --json > "$OUT/list-certs.json"

echo "== 1. single, B-B, default template"
sign "$FIX/sample.pdf" --out "$OUT/1-single-BB.pdf" --box LAST:0.55,0.06,0.40,0.11 \
  --reason "Phê duyệt hợp đồng" --location "Hà Nội" | tee "$OUT/1.txt"

echo "== 2. hash-on-token mechanism (CKM_SHA256_RSA_PKCS)"
echo "$PIN" | PDFSIGN_PKCS11_MECHANISM=sha256-rsa-pkcs "$BIN" -v sign --module "$MODULE" --pin-stdin \
  "$FIX/sample.pdf" --out "$OUT/2-sha256-rsa-pkcs.pdf" 2> "$OUT/2.stderr.txt" | tee "$OUT/2.txt"
grep -q "Sha256RsaPkcs" "$OUT/2.stderr.txt"

echo "== 3. batch: 3 files, same box, folder + suffix"
mkdir -p "$OUT/batch-in"
cp "$FIX/sample.pdf" "$OUT/batch-in/hop-dong-01.pdf"
cp "$FIX/sample-xrefstream.pdf" "$OUT/batch-in/hop-dong-02.pdf"
cp "$FIX/sample-rotated.pdf" "$OUT/batch-in/phu-luc-03.pdf"
sign "$OUT"/batch-in/*.pdf --out-dir "$OUT/batch-out" --suffix "-da-ky" --box LAST:0.6,0.05,0.35,0.1 \
  --level B-T --tsa "$TSA" --json > "$OUT/3-batch.json"
ls "$OUT/batch-out" | tee "$OUT/3.txt"
[ "$(ls "$OUT/batch-out" | wc -l)" -eq 3 ]

echo "== 4. multi-signature: two boxes on one file (sequential incremental signatures)"
sign "$FIX/sample.pdf" --out "$OUT/4-multi.pdf" --box 1:0.05,0.06,0.40,0.11 --box LAST:0.55,0.06,0.40,0.11 \
  --level B-T --tsa "$TSA" | tee "$OUT/4.txt"

for lvl in B-T B-LT B-LTA; do
  echo "== 5. level $lvl"
  sign "$FIX/sample.pdf" --out "$OUT/5-$lvl.pdf" --box LAST:0.55,0.06,0.40,0.11 --level "$lvl" --tsa "$TSA" \
    --template full --reason "Ký thử $lvl" --location "TP. Hồ Chí Minh" | tee "$OUT/5-$lvl.txt"
  grep -q "($lvl," "$OUT/5-$lvl.txt"
done

echo "== 6. wrong PIN must fail with ERRCODE:PIN_INCORRECT"
set +e
echo "000000" | "$BIN" sign --module "$MODULE" --pin-stdin "$FIX/sample.pdf" --out "$OUT/should-not-exist.pdf" 2> "$OUT/6-wrong-pin.stderr.txt"
rc=$?
set -e
cat "$OUT/6-wrong-pin.stderr.txt"
grep -q "ERRCODE:PIN_INCORRECT" "$OUT/6-wrong-pin.stderr.txt" && [ $rc -ne 0 ] && [ ! -f "$OUT/should-not-exist.pdf" ]
if grep -rq "$PIN" "$OUT"/*.txt "$OUT"/*.json "$OUT/config" 2>/dev/null; then echo "PIN leaked into output!"; exit 1; fi

echo "== pdfsign verify (own verifier, trust = test CA)"
for f in "$OUT"/*.pdf "$OUT"/batch-out/*.pdf; do
  "$BIN" verify --trust "$PKI/ca.cert.pem" "$f" > "${f%.pdf}.verify.txt"
  head -1 "${f%.pdf}.verify.txt"
done
"$BIN" verify --trust "$PKI/ca.cert.pem" --json "$OUT/5-B-LTA.pdf" > "$OUT/5-B-LTA.verify.json"

if command -v qpdf >/dev/null; then
  for f in "$OUT"/*.pdf "$OUT"/batch-out/*.pdf; do qpdf --check "$f" >/dev/null || { echo "qpdf failed: $f"; exit 1; }; done
  echo "qpdf --check OK for all outputs"
fi

if command -v pyhanko >/dev/null; then
  echo "== pyhanko sign validate (all outputs)"
  : > "$OUT/pyhanko-summary.txt"
  for f in "$OUT"/*.pdf "$OUT"/batch-out/*.pdf; do
    pyhanko sign validate --trust "$PKI/ca.cert.pem" --trust-replace --pretty-print "$f" > "${f%.pdf}.pyhanko.txt" 2>&1 || true
    n_valid=$(grep -c "judged VALID" "${f%.pdf}.pyhanko.txt" || true)
    n_fields=$(grep -c "^Field " "${f%.pdf}.pyhanko.txt" || true)
    echo "$(basename "$f"): $n_valid/$n_fields VALID" | tee -a "$OUT/pyhanko-summary.txt"
    [ "$n_valid" -ge 1 ] && [ "$n_valid" -eq "$n_fields" ]
  done
  echo "== pyhanko sign adesverify (B-LTA)"
  pyhanko sign adesverify --trust "$PKI/ca.cert.pem" --trust-replace --pretty-print "$OUT/5-B-LTA.pdf" > "$OUT/5-B-LTA.adesverify.txt" 2>&1
  grep "judged" "$OUT/5-B-LTA.adesverify.txt"
fi

if [ -n "${LTV_PYTHON:-}" ]; then
  echo "== pyHanko PAdES-LT / PAdES-LTA validation (legacy LTV validator)"
  "$LTV_PYTHON" "$ROOT/scripts/pyhanko_ltv_check.py" "$OUT/5-B-LT.pdf" "$PKI/ca.cert.pem" lt > "$OUT/5-B-LT.ltv-check.txt" 2>&1
  "$LTV_PYTHON" "$ROOT/scripts/pyhanko_ltv_check.py" "$OUT/5-B-LTA.pdf" "$PKI/ca.cert.pem" lta > "$OUT/5-B-LTA.ltv-check.txt" 2>&1
  grep RESULT "$OUT"/5-B-LT*.ltv-check.txt
fi

if command -v pdfsig >/dev/null; then
  pdfsig "$OUT/4-multi.pdf" > "$OUT/4-multi.pdfsig.txt" 2>/dev/null || true
  [ "$(grep -c 'Signature is Valid' "$OUT/4-multi.pdfsig.txt")" -eq 2 ]
  echo "pdfsig: 2 valid signatures in 4-multi.pdf"
fi

if command -v pdftoppm >/dev/null; then
  pdftoppm -png -r 90 -f 2 -l 2 -singlefile "$OUT/4-multi.pdf" "$OUT/4-multi-page2"
  pdftoppm -png -r 90 -f 1 -l 1 -singlefile "$OUT/4-multi.pdf" "$OUT/4-multi-page1"
  pdftoppm -png -r 90 -f 2 -l 2 -singlefile "$OUT/5-B-LTA.pdf" "$OUT/5-B-LTA-page2"
fi
echo "E2E OK -> $OUT"
