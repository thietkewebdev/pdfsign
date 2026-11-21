#!/usr/bin/env bash
# Guest free limit: 2 completed signatures OK, 3rd blocked with GUEST_LIMIT_REACHED, works after login.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP_URL="${APP_URL:-http://127.0.0.1:8080}"
SAMPLE="${SAMPLE:-$ROOT/pdfsign-signer-rust/tests/fixtures/sample.pdf}"
DATABASE_URL="${DATABASE_URL:-postgres://pdfsign:pdfsign@127.0.0.1:5432/pdfsign}"
COOKIE="$(mktemp)"
FP="test-fp-$(date +%s)-$$"
HDR=(-H "X-Pdfsign-Fingerprint: $FP")
cleanup() { rm -f "$COOKIE"; }
trap cleanup EXIT

echo "== guest quota bootstrap =="
curl -fsS -c "$COOKIE" -b "$COOKIE" "${HDR[@]}" "$APP_URL/api/v1/guest/quota" | tee /tmp/guest-quota1.json
python3 -c 'import json; d=json.load(open("/tmp/guest-quota1.json")); assert d["limit"]==2 and d["used"]==0'

guest_id_from_quota() {
  python3 -c 'import json; print(json.load(open("/tmp/guest-quota1.json"))["guestId"])'
}

record_fake_completion() {
  local n="$1"
  local gid
  gid="$(guest_id_from_quota)"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
    "INSERT INTO guest_completions (id, guest_id, fingerprint_hash, ip_hash, job_id)
     SELECT 'gsc_test_${n}_' || substr(md5(random()::text),1,8),
            g.id, g.fingerprint_hash, g.ip_hash,
            'job_fake_${n}_' || substr(md5(random()::text),1,8)
     FROM guest_sessions g WHERE g.id = '$gid';"
}

echo "== upload 1 (allowed) =="
UP1=$(curl -fsS -c "$COOKIE" -b "$COOKIE" "${HDR[@]}" \
  -F "file=@${SAMPLE};type=application/pdf" -F "title=g1.pdf" \
  "$APP_URL/api/v1/documents")
echo "$UP1" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("guest") is True; print(d["publicId"])'

echo "== simulate 2 completions =="
record_fake_completion 1
record_fake_completion 2

curl -fsS -c "$COOKIE" -b "$COOKIE" "${HDR[@]}" "$APP_URL/api/v1/guest/quota" | tee /tmp/guest-quota2.json
python3 -c 'import json; d=json.load(open("/tmp/guest-quota2.json")); assert d["used"]==2, d; print("used=2")'

echo "== upload 3rd blocked =="
CODE=$(curl -sS -o /tmp/guest-block.json -w "%{http_code}" -c "$COOKIE" -b "$COOKIE" "${HDR[@]}" \
  -F "file=@${SAMPLE};type=application/pdf" -F "title=g3.pdf" \
  "$APP_URL/api/v1/documents")
echo "http=$CODE body=$(cat /tmp/guest-block.json)"
python3 - <<'PY'
import json
d=json.load(open("/tmp/guest-block.json"))
assert d.get("errorCode")=="GUEST_LIMIT_REACHED", d
print("GUEST_LIMIT_REACHED ok")
PY
[[ "$CODE" == "403" ]]

echo "== register attaches guest + allows upload =="
EMAIL="guest-lim-$(date +%s)@pdfsign.local"
curl -fsS -c "$COOKIE" -b "$COOKIE" "${HDR[@]}" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"guest-pass-12\",\"name\":\"GuestLim\"}" \
  "$APP_URL/api/v1/auth/register" >/dev/null
UP3=$(curl -fsS -c "$COOKIE" -b "$COOKIE" "${HDR[@]}" \
  -F "file=@${SAMPLE};type=application/pdf" -F "title=after-login.pdf" \
  "$APP_URL/api/v1/documents")
echo "$UP3" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("publicId"); print("after-login upload ok", d["publicId"])'
echo "GUEST LIMIT TEST OK"
