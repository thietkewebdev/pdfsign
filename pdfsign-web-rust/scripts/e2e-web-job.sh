#!/usr/bin/env bash
# Protocol v1: create job → deep link → pdfsign web-sign (SoftHSM) → complete verified.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WEB="$ROOT/pdfsign-web-rust"
SIGNER="$ROOT/pdfsign-signer-rust"
APP_URL="${APP_URL:-http://127.0.0.1:8080}"
COOKIE_JAR="$(mktemp)"
WORKDIR="$(mktemp -d)"
TOKDIR="$(mktemp -d)"
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
LABEL="PDFSIGN-WEB-E2E"
softhsm2-util --init-token --free --label "$LABEL" --pin "$PIN" --so-pin 12345678 >/dev/null
softhsm2-util --import "$PKI/signer.key.pem" --token "$LABEL" --label "web-e2e" --id 01 --pin "$PIN" >/dev/null
pkcs11-tool --module "$MODULE" --token-label "$LABEL" --login --pin "$PIN" \
  --write-object "$PKI/signer.cert.der" --type cert --id 01 --label "web-e2e" >/dev/null

echo "== health protocol =="
curl -fsS "$APP_URL/api/v1/health" | tee "$WORKDIR/health.json"
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert d["ok"] and d["protocol"]==1' "$WORKDIR/health.json"

EMAIL="e2e-$(date +%s)@pdfsign.local"
PASS='e2e-pass-12'
curl -fsS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"name\":\"E2E\"}" \
  "$APP_URL/api/v1/auth/register" >/dev/null

DOC_JSON=$(curl -fsS -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -F "file=@${SAMPLE};type=application/pdf" -F "title=e2e.pdf" \
  "$APP_URL/api/v1/documents")
DOC_ID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["documentId"])' <<<"$DOC_JSON")

JOB_JSON=$(curl -fsS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"documentId\":\"$DOC_ID\",\"placement\":{\"page\":\"LAST\",\"rectPct\":{\"x\":0.64,\"y\":0.06,\"w\":0.32,\"h\":0.10}}}" \
  "$APP_URL/api/v1/jobs")
echo "$JOB_JSON" | tee "$WORKDIR/job.json"
JOB_ID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["jobId"])' <<<"$JOB_JSON")
DEEP=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["deepLink"])' <<<"$JOB_JSON")
echo "job=$JOB_ID"
echo "deepLink=$DEEP"
[[ "$DEEP" == pdfsign://v1/sign?t=* ]] || [[ "$DEEP" == pdfsign://v1/sign?t=* ]]
python3 -c 'import sys; assert sys.argv[1].startswith("pdfsign://v1/sign?t=")' "$DEEP"

echo "== desktop web-sign =="
echo "$PIN" | "$BIN" web-sign --deep-link "$DEEP" --module "$MODULE" --pin-stdin --level B-B

STATUS=$(curl -fsS -c "$COOKIE_JAR" -b "$COOKIE_JAR" "$APP_URL/api/v1/jobs/$JOB_ID/status")
echo "$STATUS" | tee "$WORKDIR/status.json"
python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["status"]=="COMPLETED"; print("E2E WEB JOB OK (protocol v1)")' <<<"$STATUS"
