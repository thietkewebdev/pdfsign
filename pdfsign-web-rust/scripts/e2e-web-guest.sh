#!/usr/bin/env bash
# Guest SoftHSM e2e: no account → upload → job → web-sign → COMPLETED
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WEB="$ROOT/pdfsign-web-rust"
SIGNER="$ROOT/pdfsign-signer-rust"
APP_URL="${APP_URL:-http://127.0.0.1:8080}"
COOKIE_JAR="$(mktemp)"
WORKDIR="$(mktemp -d)"
TOKDIR="$(mktemp -d)"
FP="e2e-guest-fp-$(date +%s)"
cleanup() { rm -f "$COOKIE_JAR"; rm -rf "$WORKDIR" "$TOKDIR"; }
trap cleanup EXIT

BIN="${PDFSIGN_BIN:-$SIGNER/target/debug/pdfsign}"
[[ -x "$BIN" ]] || (cd "$SIGNER" && cargo build -p pdfsign-cli)
BIN="${PDFSIGN_BIN:-$SIGNER/target/debug/pdfsign}"

MODULE="${SOFTHSM2_MODULE:-}"
for cand in /usr/lib/softhsm/libsofthsm2.so /usr/lib/x86_64-linux-gnu/softhsm/libsofthsm2.so; do
  [[ -z "$MODULE" && -f "$cand" ]] && MODULE="$cand"
done
[[ -n "$MODULE" ]] || { echo "SoftHSM2 module not found"; exit 1; }

PKI="$SIGNER/tests/fixtures/pki-ltv"
SAMPLE="$SIGNER/tests/fixtures/sample.pdf"

export SOFTHSM2_CONF="$TOKDIR/softhsm2.conf"
printf 'directories.tokendir = %s\nobjectstore.backend = file\nlog.level = ERROR\n' "$TOKDIR" > "$SOFTHSM2_CONF"
PIN=123456
LABEL="PDFSIGN-GUEST-E2E"
softhsm2-util --init-token --free --label "$LABEL" --pin "$PIN" --so-pin 12345678 >/dev/null
softhsm2-util --import "$PKI/signer.key.pem" --token "$LABEL" --label "guest-e2e" --id 01 --pin "$PIN" >/dev/null
pkcs11-tool --module "$MODULE" --token-label "$LABEL" --login --pin "$PIN" \
  --write-object "$PKI/signer.cert.der" --type cert --id 01 --label "guest-e2e" >/dev/null

HDR=(-H "X-Pdfsign-Fingerprint: $FP")

echo "== guest upload =="
DOC_JSON=$(curl -fsS -c "$COOKIE_JAR" -b "$COOKIE_JAR" "${HDR[@]}" \
  -F "file=@${SAMPLE};type=application/pdf" -F "title=guest-e2e.pdf" \
  "$APP_URL/api/v1/documents")
echo "$DOC_JSON" | tee "$WORKDIR/doc.json"
DOC_ID=$(python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("guest") is True; print(d["documentId"])' <<<"$DOC_JSON")

JOB_JSON=$(curl -fsS -c "$COOKIE_JAR" -b "$COOKIE_JAR" "${HDR[@]}" -H 'Content-Type: application/json' \
  -d "{\"documentId\":\"$DOC_ID\",\"placement\":{\"page\":\"LAST\",\"rectPct\":{\"x\":0.64,\"y\":0.06,\"w\":0.32,\"h\":0.10}}}" \
  "$APP_URL/api/v1/jobs")
echo "$JOB_JSON" | tee "$WORKDIR/job.json"
JOB_ID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["jobId"])' <<<"$JOB_JSON")
DEEP=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["deepLink"])' <<<"$JOB_JSON")
python3 -c 'import sys; assert sys.argv[1].startswith("pdfsign://v1/sign?t=")' "$DEEP"

echo "== desktop web-sign =="
echo "$PIN" | "$BIN" web-sign --deep-link "$DEEP" --module "$MODULE" --pin-stdin --level B-B

STATUS=$(curl -fsS -c "$COOKIE_JAR" -b "$COOKIE_JAR" "${HDR[@]}" "$APP_URL/api/v1/jobs/$JOB_ID/status")
echo "$STATUS" | tee "$WORKDIR/status.json"
python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["status"]=="COMPLETED"; print("E2E WEB GUEST JOB OK")' <<<"$STATUS"

QUOTA=$(curl -fsS -c "$COOKIE_JAR" -b "$COOKIE_JAR" "${HDR[@]}" "$APP_URL/api/v1/guest/quota")
python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["used"]>=1; print("guest used", d["used"])' <<<"$QUOTA"
