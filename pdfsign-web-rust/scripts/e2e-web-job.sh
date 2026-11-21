#!/usr/bin/env bash
# create job -> claim -> fetch -> SoftHSM sign (CLI) -> complete (server verifies PAdES).
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
[[ -f "$SAMPLE" ]] || { echo "missing sample.pdf"; exit 1; }

export SOFTHSM2_CONF="$TOKDIR/softhsm2.conf"
printf 'directories.tokendir = %s\nobjectstore.backend = file\nlog.level = ERROR\n' "$TOKDIR" > "$SOFTHSM2_CONF"
PIN=123456
LABEL="PDFSIGN-WEB-E2E"
softhsm2-util --init-token --free --label "$LABEL" --pin "$PIN" --so-pin 12345678 >/dev/null
softhsm2-util --import "$PKI/signer.key.pem" --token "$LABEL" --label "web-e2e" --id 01 --pin "$PIN" >/dev/null
pkcs11-tool --module "$MODULE" --token-label "$LABEL" --login --pin "$PIN" \
  --write-object "$PKI/signer.cert.der" --type cert --id 01 --label "web-e2e" >/dev/null

echo "== health =="
curl -fsS "$APP_URL/api/health" >/dev/null

EMAIL="e2e-$(date +%s)@pdfsign.local"
PASS='e2e-pass-12'
curl -fsS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"name\":\"E2E\"}" \
  "$APP_URL/api/auth/register" >/dev/null

DOC_JSON=$(curl -fsS -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -F "file=@${SAMPLE};type=application/pdf" -F "title=e2e.pdf" \
  "$APP_URL/api/documents")
DOC_ID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["documentId"])' <<<"$DOC_JSON")

JOB_JSON=$(curl -fsS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"documentId\":\"$DOC_ID\",\"placement\":{\"page\":\"LAST\",\"rectPct\":{\"x\":0.64,\"y\":0.06,\"w\":0.32,\"h\":0.10}}}" \
  "$APP_URL/api/jobs")
JOB_ID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["jobId"])' <<<"$JOB_JSON")
CLAIM=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["claimCode"])' <<<"$JOB_JSON")
echo "job=$JOB_ID"

CLAIM_JSON=$(curl -fsS -H 'Content-Type: application/json' \
  -d "{\"code\":\"$CLAIM\"}" "$APP_URL/api/jobs/$JOB_ID/claim")
TOKEN=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["jobToken"])' <<<"$CLAIM_JSON")

JOB=$(curl -fsS -H "x-job-token: $TOKEN" "$APP_URL/api/jobs/$JOB_ID")
PDF_URL=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["inputPdfUrl"])' <<<"$JOB")
curl -fsS "$PDF_URL" -o "$WORKDIR/input.pdf"

echo "$PIN" | "$BIN" sign --module "$MODULE" --pin-stdin \
  "$WORKDIR/input.pdf" --out "$WORKDIR/signed.pdf" \
  --box LAST:0.64,0.06,0.32,0.10 --level B-B

COMPLETE=$(curl -fsS -H "x-job-token: $TOKEN" \
  -F "file=@$WORKDIR/signed.pdf;type=application/pdf" \
  -F 'certMeta={"subjectCN":"","serial":"","signingTime":"2026-01-01T00:00:00Z"}' \
  "$APP_URL/api/jobs/$JOB_ID/complete")
python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("versionNumber",0)>=2; assert d.get("verify"); print("complete OK")' <<<"$COMPLETE"

STATUS=$(curl -fsS "$APP_URL/api/jobs/$JOB_ID/status")
python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["status"]=="COMPLETED"; print("E2E WEB JOB OK")' <<<"$STATUS"
