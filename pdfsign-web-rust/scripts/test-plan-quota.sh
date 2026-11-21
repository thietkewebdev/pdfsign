#!/usr/bin/env bash
# Registered free plan: one-time trial (default 5), then PLAN_QUOTA_REACHED; admin can set plan.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP_URL="${APP_URL:-http://127.0.0.1:8080}"
SAMPLE="${SAMPLE:-$ROOT/pdfsign-signer-rust/tests/fixtures/sample.pdf}"
DATABASE_URL="${DATABASE_URL:-postgres://pdfsign:pdfsign@127.0.0.1:5432/pdfsign}"
ADMIN_TOKEN="${ADMIN_TOKEN:-dev-admin-token}"
COOKIE="$(mktemp)"
cleanup() { rm -f "$COOKIE"; }
trap cleanup EXIT

EMAIL="quota-$(date +%s)@pdfsign.local"
PASS="quota-pass-12"

echo "== register =="
REG=$(curl -fsS -c "$COOKIE" -b "$COOKIE" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"name\":\"Quota\"}" \
  "$APP_URL/api/v1/auth/register")
USER_ID=$(echo "$REG" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')

echo "== burn trial via DB (5) =="
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "UPDATE users SET trial_files_used = 5 WHERE id = '$USER_ID';"

echo "== upload blocked =="
CODE=$(curl -sS -o /tmp/quota-block.json -w "%{http_code}" -c "$COOKIE" -b "$COOKIE" \
  -F "file=@${SAMPLE};type=application/pdf" -F "title=q.pdf" \
  "$APP_URL/api/v1/documents")
echo "http=$CODE body=$(cat /tmp/quota-block.json)"
python3 - <<'PY'
import json
d=json.load(open("/tmp/quota-block.json"))
assert d.get("errorCode")=="PLAN_QUOTA_REACHED", d
print("PLAN_QUOTA_REACHED ok")
PY
[[ "$CODE" == "402" ]]

echo "== admin set personal plan =="
curl -fsS -H "X-Admin-Token: $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"plan":"personal","planPeriod":"monthly"}' \
  "$APP_URL/api/v1/admin/users/$USER_ID/plan" | tee /tmp/quota-plan.json
python3 -c 'import json; d=json.load(open("/tmp/quota-plan.json")); assert d["plan"]=="personal"'

echo "== upload allowed after plan =="
UP=$(curl -fsS -c "$COOKIE" -b "$COOKIE" \
  -F "file=@${SAMPLE};type=application/pdf" -F "title=after-plan.pdf" \
  "$APP_URL/api/v1/documents")
echo "$UP" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("publicId"); print("ok", d["publicId"])'

echo "PLAN QUOTA TEST OK"
