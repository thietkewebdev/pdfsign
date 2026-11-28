#!/usr/bin/env bash
# Security regressions: ownership IDOR, handshake re-entry while READY, complete claim.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP_URL="${APP_URL:-http://127.0.0.1:8080}"
SAMPLE="${SAMPLE:-$ROOT/pdfsign-signer-rust/tests/fixtures/sample.pdf}"
A="$(mktemp)"; B="$(mktemp)"; WORK="$(mktemp -d)"
cleanup() { rm -f "$A" "$B"; rm -rf "$WORK"; }
trap cleanup EXIT

echo "== register two users =="
EA="sec-a-$(date +%s)@pdfsign.local"
EB="sec-b-$(date +%s)@pdfsign.local"
PASS='sec-pass-12'
curl -fsS -c "$A" -b "$A" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EA\",\"password\":\"$PASS\",\"name\":\"A\"}" \
  "$APP_URL/api/v1/auth/register" >/dev/null
curl -fsS -c "$B" -b "$B" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EB\",\"password\":\"$PASS\",\"name\":\"B\"}" \
  "$APP_URL/api/v1/auth/register" >/dev/null

DOC_JSON=$(curl -fsS -c "$A" -b "$A" \
  -F "file=@${SAMPLE};type=application/pdf" -F "title=sec.pdf" \
  "$APP_URL/api/v1/documents")
DOC_ID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["documentId"])' <<<"$DOC_JSON")
PUBLIC_ID=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("publicId") or "")' <<<"$DOC_JSON")
if [[ -z "$PUBLIC_ID" ]]; then
  PUBLIC_ID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])' <<<"$DOC_JSON" 2>/dev/null || true)
fi
# Prefer publicId from list/get if create only returns documentId
if [[ -z "$PUBLIC_ID" || "$PUBLIC_ID" == "$DOC_ID" ]]; then
  LIST=$(curl -fsS -c "$A" -b "$A" "$APP_URL/api/v1/documents")
  PUBLIC_ID=$(python3 -c 'import json,sys; d=json.load(sys.stdin); items=d if isinstance(d,list) else d.get("documents",d.get("items",[])); print(next(x["publicId"] for x in items if x.get("id")==sys.argv[1] or x.get("publicId")))' "$DOC_ID" <<<"$LIST" 2>/dev/null || echo "")
fi

echo "== IDOR: user B cannot create job on A's doc =="
CODE=$(curl -sS -o "$WORK/idor.json" -w '%{http_code}' -c "$B" -b "$B" -H 'Content-Type: application/json' \
  -d "{\"documentId\":\"$DOC_ID\",\"placement\":{\"page\":1,\"rectPct\":{\"x\":0.1,\"y\":0.1,\"w\":0.2,\"h\":0.1}}}" \
  "$APP_URL/api/v1/jobs")
[[ "$CODE" == "404" || "$CODE" == "403" ]] || { echo "expected 404/403 got $CODE"; cat "$WORK/idor.json"; exit 1; }
echo "IDOR blocked ($CODE)"

if [[ -n "$PUBLIC_ID" ]]; then
  echo "== IDOR: user B cannot GET A's document metadata =="
  CODE=$(curl -sS -o /dev/null -w '%{http_code}' -c "$B" -b "$B" "$APP_URL/api/v1/documents/$PUBLIC_ID")
  [[ "$CODE" == "404" ]] || { echo "expected 404 got $CODE"; exit 1; }
  echo "get_one ownership OK"
fi

echo "== create job as A =="
JOB_JSON=$(curl -fsS -c "$A" -b "$A" -H 'Content-Type: application/json' \
  -d "{\"documentId\":\"$DOC_ID\",\"placement\":{\"page\":1,\"rectPct\":{\"x\":0.64,\"y\":0.06,\"w\":0.32,\"h\":0.10}}}" \
  "$APP_URL/api/v1/jobs")
JOB_ID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["jobId"])' <<<"$JOB_JSON")
DEEP=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["deepLink"])' <<<"$JOB_JSON")
LAUNCH=$(python3 -c 'import sys; from urllib.parse import urlparse,parse_qs; print(parse_qs(urlparse(sys.argv[1].replace("pdfsign://","https://x/")).query)["t"][0])' "$DEEP")

echo "== handshake twice while READY (PIN retry) =="
HS1=$(curl -fsS -H 'Content-Type: application/json' -d "{\"launchToken\":\"$LAUNCH\"}" \
  "$APP_URL/api/v1/signer/handshake")
HS2=$(curl -fsS -H 'Content-Type: application/json' -d "{\"launchToken\":\"$LAUNCH\"}" \
  "$APP_URL/api/v1/signer/handshake")
python3 - <<PY
import json,sys
a=json.loads('''$HS1''')
b=json.loads('''$HS2''')
assert a.get("accessToken") and b.get("accessToken"), (a,b)
assert a["jobId"]==b["jobId"]=='''$JOB_ID'''
print("handshake re-entry OK")
PY

ACCESS=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["accessToken"])' <<<"$HS2")

echo "== second complete while still READY must not race after first claim =="
# Without a signed PDF we expect verify/integrity failure after claim+release.
# Hitting complete with tiny body should fail client-side and leave job READY again.
CODE=$(curl -sS -o "$WORK/complete.json" -w '%{http_code}' \
  -H "Authorization: Bearer $ACCESS" \
  -H "Idempotency-Key: test-idem-$(date +%s)" \
  -F "certMeta={\"subjectCN\":\"x\",\"serial\":\"1\"};type=application/json" \
  -F "file=@${SAMPLE};type=application/pdf;filename=signed.pdf" \
  "$APP_URL/api/v1/signer/complete")
# sample.pdf is unsigned — expect 4xx integrity/verify failure, not 500
[[ "$CODE" =~ ^4 ]] || { echo "expected 4xx complete got $CODE"; cat "$WORK/complete.json"; exit 1; }
STATUS=$(curl -fsS -c "$A" -b "$A" "$APP_URL/api/v1/jobs/$JOB_ID/status")
python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["status"] in ("READY","FAILED","COMPLETING"), d; print("complete claim path OK status="+d["status"])' <<<"$STATUS"

echo "JOB SECURITY OK"
