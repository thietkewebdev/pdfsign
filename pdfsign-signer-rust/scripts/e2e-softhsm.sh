#!/usr/bin/env bash
# End-to-end test through a real PKCS#11 module (SoftHSM2), no hardware token needed.
# Requires: softhsm2-util, pkcs11-tool (OpenSC). Optional: pyhanko, pdfsig, pdftoppm, qpdf.
# Usage: scripts/e2e-softhsm.sh [OUT_DIR]   (env PDFSIGN_BIN to use a prebuilt binary)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/target/e2e}"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
PKI="$ROOT/tests/fixtures/pki"
BIN="${PDFSIGN_BIN:-$ROOT/target/debug/pdfsign}"
[ -x "$BIN" ] || (cd "$ROOT" && cargo build -p pdfsign-cli)

MODULE="${SOFTHSM2_MODULE:-}"
for cand in /usr/lib/softhsm/libsofthsm2.so /usr/lib/x86_64-linux-gnu/softhsm/libsofthsm2.so \
  /opt/homebrew/lib/softhsm/libsofthsm2.so /usr/local/lib/softhsm/libsofthsm2.so; do
  [ -z "$MODULE" ] && [ -f "$cand" ] && MODULE="$cand"
done
[ -n "$MODULE" ] || { echo "SoftHSM2 module not found (set SOFTHSM2_MODULE)"; exit 1; }

TOKDIR="$(mktemp -d)"
export SOFTHSM2_CONF="$TOKDIR/softhsm2.conf"
printf 'directories.tokendir = %s\nobjectstore.backend = file\nlog.level = ERROR\n' "$TOKDIR" > "$SOFTHSM2_CONF"
PIN=123456
LABEL="PDFSIGN-TEST"

echo "== init SoftHSM2 token ($MODULE)"
softhsm2-util --init-token --free --label "$LABEL" --pin "$PIN" --so-pin 12345678 >/dev/null
softhsm2-util --import "$PKI/signer.key.pem" --token "$LABEL" --label "Nguyen Van Thu" --id 01 --pin "$PIN" >/dev/null
pkcs11-tool --module "$MODULE" --token-label "$LABEL" --login --pin "$PIN" \
  --write-object "$PKI/signer.cert.der" --type cert --id 01 --label "Nguyen Van Thu" >/dev/null
pkcs11-tool --module "$MODULE" --token-label "$LABEL" --login --pin "$PIN" \
  --write-object "$PKI/ca.cert.der" --type cert --id 02 --label "PDFSign Test Root CA" >/dev/null

echo "== pdfsign list-tokens"
"$BIN" list-tokens --module "$MODULE" | tee "$OUT/list-tokens.txt"

echo "== pdfsign list-certs --json"
"$BIN" list-certs --module "$MODULE" --json | tee "$OUT/list-certs.json"

echo "== pdfsign sign (PIN via stdin)"
echo "$PIN" | "$BIN" sign --module "$MODULE" --pin-stdin --cert 0 \
  --in "$ROOT/tests/fixtures/sample.pdf" --out "$OUT/signed-softhsm.pdf" \
  --page LAST --rect 0.55,0.06,0.40,0.11 --reason "Phê duyệt hợp đồng" --location "Hà Nội" --json \
  | tee "$OUT/sign-result.json"

echo "== wrong PIN must fail with ERRCODE:PIN_INCORRECT"
set +e
echo "000000" | "$BIN" sign --module "$MODULE" --pin-stdin --in "$ROOT/tests/fixtures/sample.pdf" \
  --out "$OUT/should-not-exist.pdf" 2> "$OUT/wrong-pin.stderr.txt"
rc=$?
set -e
cat "$OUT/wrong-pin.stderr.txt"
grep -q "ERRCODE:PIN_INCORRECT" "$OUT/wrong-pin.stderr.txt" && [ $rc -ne 0 ] && [ ! -f "$OUT/should-not-exist.pdf" ]
if grep -q "$PIN" "$OUT"/*.txt "$OUT"/*.json 2>/dev/null; then echo "PIN leaked into output!"; exit 1; fi

echo "== pdfsign verify"
"$BIN" verify "$OUT/signed-softhsm.pdf" | tee "$OUT/pdfsign-verify.txt"

if command -v qpdf >/dev/null; then
  echo "== qpdf --check"
  qpdf --check "$OUT/signed-softhsm.pdf" | tee "$OUT/qpdf-check.txt"
fi

if command -v pyhanko >/dev/null; then
  echo "== pyhanko sign validate"
  pyhanko sign validate --pretty-print --trust "$PKI/ca.cert.pem" "$OUT/signed-softhsm.pdf" \
    | tee "$OUT/pyhanko-validate.txt"
  grep -q "The signature is judged VALID" "$OUT/pyhanko-validate.txt"
fi

if command -v pdfsig >/dev/null; then
  echo "== pdfsig"
  pdfsig "$OUT/signed-softhsm.pdf" | tee "$OUT/pdfsig.txt" || true
  grep -q "Signature Validation: Signature is Valid." "$OUT/pdfsig.txt"
fi

if command -v pdftoppm >/dev/null; then
  pdftoppm -png -r 110 -f 2 -l 2 -singlefile "$OUT/signed-softhsm.pdf" "$OUT/signed-softhsm-page2"
  echo "rendered $OUT/signed-softhsm-page2.png"
fi

rm -rf "$TOKDIR"
echo "E2E OK -> $OUT"
