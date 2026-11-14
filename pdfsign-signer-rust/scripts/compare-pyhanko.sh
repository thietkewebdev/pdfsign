#!/usr/bin/env bash
# Sign the same PDF with the same SoftHSM2 key via
#   (a) the production Python core (desktop-signer/sign_core.py = PDFSignProSignerCore.exe, pyHanko)
#   (b) the Rust CLI
# then dump both signatures. desktop-signer is copied to a temp dir and only read.
# Requires: softhsm2-util, pkcs11-tool; WPF_PYTHON = python with pyHanko<=0.29.0 (sign_core.py imports the
# private pyhanko.sign.pkcs11._pull_cert, removed in 0.29.1), python-pkcs11, pikepdf, reportlab.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/target/compare}"
mkdir -p "$OUT"; OUT="$(cd "$OUT" && pwd)"
PKI="$ROOT/tests/fixtures/pki"
BIN="${PDFSIGN_BIN:-$ROOT/target/debug/pdfsign}"
MODULE="${SOFTHSM2_MODULE:-/usr/lib/softhsm/libsofthsm2.so}"
FONT="${NOTO_FONT:-$ROOT/assets/fonts/NotoSans-Regular.ttf}"

DS="$(mktemp -d)"
cp -r "$ROOT/../desktop-signer/." "$DS/"
mkdir -p "$DS/assets/fonts" && cp "$FONT" "$DS/assets/fonts/NotoSans-Regular.ttf"

TOKDIR="$(mktemp -d)"
export SOFTHSM2_CONF="$TOKDIR/softhsm2.conf"
printf 'directories.tokendir = %s\nobjectstore.backend = file\nlog.level = ERROR\n' "$TOKDIR" > "$SOFTHSM2_CONF"
PIN=123456
softhsm2-util --init-token --free --label CMP --pin "$PIN" --so-pin 12345678 >/dev/null
softhsm2-util --import "$PKI/signer.key.pem" --token CMP --label signer --id 01 --pin "$PIN" >/dev/null
pkcs11-tool --module "$MODULE" --token-label CMP --login --pin "$PIN" \
  --write-object "$PKI/signer.cert.der" --type cert --id 01 --label signer >/dev/null

RECT="0.55,0.06,0.40,0.11"
echo "== (a) WPF path: sign_core.py (pyHanko) template=valid"
# sign_core.py takes the PIN in argv; that is how the WPF host calls it (see ANALYSIS.md).
PDFSIGN_ALLOW_EXPIRED=1 "${WPF_PYTHON:-python3}" "$DS/sign_core.py" --in "$ROOT/tests/fixtures/sample.pdf" \
  --out "$OUT/signed-pyhanko-wpf.pdf" --dll "$MODULE" --cert-index 0 --pin "$PIN" \
  --page LAST --rectPct "$RECT" --template valid

echo "== (b) Rust CLI"
echo "$PIN" | "$BIN" sign --module "$MODULE" --pin-stdin --cert 0 \
  --in "$ROOT/tests/fixtures/sample.pdf" --out "$OUT/signed-rust.pdf" --page LAST --rect "$RECT"

echo "== rotated page (/Rotate 90), same rectPct, both signers"
PDFSIGN_ALLOW_EXPIRED=1 "${WPF_PYTHON:-python3}" "$DS/sign_core.py" --in "$ROOT/tests/fixtures/sample-rotated.pdf" \
  --out "$OUT/rotated-pyhanko-wpf.pdf" --dll "$MODULE" --cert-index 0 --pin "$PIN" \
  --page LAST --rectPct "$RECT" --template valid
echo "$PIN" | "$BIN" sign --module "$MODULE" --pin-stdin --cert 0 \
  --in "$ROOT/tests/fixtures/sample-rotated.pdf" --out "$OUT/rotated-rust.pdf" --page LAST --rect "$RECT"
for f in rotated-pyhanko-wpf rotated-rust; do
  pdftoppm -png -r 60 -singlefile "$OUT/$f.pdf" "$OUT/$f" 2>/dev/null || true
done

python3 "$ROOT/scripts/dump_signature.py" "$OUT/signed-pyhanko-wpf.pdf" > "$OUT/dump-pyhanko-wpf.json"
python3 "$ROOT/scripts/dump_signature.py" "$OUT/signed-rust.pdf" > "$OUT/dump-rust.json"
for f in signed-pyhanko-wpf signed-rust; do
  pyhanko sign validate --pretty-print --trust "$PKI/ca.cert.pem" "$OUT/$f.pdf" > "$OUT/$f.validate.txt" 2>&1 || true
  pdftoppm -png -r 110 -f 2 -l 2 -singlefile "$OUT/$f.pdf" "$OUT/$f-page2" 2>/dev/null || true
done
diff <(python3 -m json.tool "$OUT/dump-pyhanko-wpf.json") <(python3 -m json.tool "$OUT/dump-rust.json") || true
rm -rf "$DS" "$TOKDIR"
echo "outputs in $OUT"
