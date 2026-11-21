#!/usr/bin/env bash
# File retention: expires_at set on upload; purge deletes blobs after expiry.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_URL="${APP_URL:-http://127.0.0.1:8080}"
SAMPLE="${SAMPLE:-$ROOT/pdfsign-signer-rust/tests/fixtures/sample.pdf}"
DATABASE_URL="${DATABASE_URL:-postgres://pdfsign:pdfsign@127.0.0.1:5432/pdfsign}"
STORAGE_DIR="${STORAGE_DIR:-$WEB_ROOT/storage}"
COOKIE="$(mktemp)"
cleanup() { rm -f "$COOKIE"; }
trap cleanup EXIT

EMAIL="retain-$(date +%s)@pdfsign.local"
PASS="retain-pass-12"

echo "== register =="
curl -fsS -c "$COOKIE" -b "$COOKIE" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"name\":\"Retain\"}" \
  "$APP_URL/api/v1/auth/register" >/dev/null

echo "== upload =="
UP=$(curl -fsS -c "$COOKIE" -b "$COOKIE" \
  -F "file=@${SAMPLE};type=application/pdf" -F "title=retain.pdf" \
  "$APP_URL/api/v1/documents")
echo "$UP" | tee /tmp/retain-up.json
python3 - <<'PY'
import json
from datetime import datetime, timezone
d=json.load(open("/tmp/retain-up.json"))
assert d.get("expiresAt"), d
assert d.get("retentionHours") == 48, d
assert "Tự xóa sau 2 ngày" in d.get("retentionLabel",""), d
exp=datetime.fromisoformat(d["expiresAt"].replace("Z","+00:00"))
delta=(exp-datetime.now(timezone.utc)).total_seconds()
assert 47*3600 < delta < 49*3600, delta
print("expiresAt ok remaining~", int(delta), "s")
print("publicId", d["publicId"])
PY
PUBLIC_ID=$(python3 -c 'import json; print(json.load(open("/tmp/retain-up.json"))["publicId"])')
DOC_ID=$(python3 -c 'import json; print(json.load(open("/tmp/retain-up.json"))["documentId"])')

echo "== list shows retention =="
curl -fsS -c "$COOKIE" -b "$COOKIE" "$APP_URL/api/v1/documents" | tee /tmp/retain-list.json >/dev/null
python3 - <<PY
import json
d=json.load(open("/tmp/retain-list.json"))
assert d.get("retentionLabel")
assert any(x["publicId"]=="$PUBLIC_ID" and x.get("expiresAt") for x in d["documents"])
print("list retention ok")
PY

BLOB="$STORAGE_DIR/documents/$PUBLIC_ID/v1.pdf"
test -f "$BLOB"
echo "blob exists: $BLOB"

echo "== force expire + purge_once =="
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "UPDATE documents SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = '$DOC_ID';"

cd "$WEB_ROOT"
cargo build -q -p pdfsign-web --example purge_once
DATABASE_URL="$DATABASE_URL" STORAGE_DIR="$STORAGE_DIR" APP_URL="$APP_URL" WEB_DIST="$WEB_ROOT/web/dist" \
  ./target/debug/examples/purge_once | tee /tmp/retain-purge.out
grep -q 'purged=' /tmp/retain-purge.out

test ! -f "$BLOB"
echo "blob deleted"

CODE=$(curl -sS -o /tmp/retain-gone.json -w "%{http_code}" \
  -c "$COOKIE" -b "$COOKIE" "$APP_URL/api/v1/documents/$PUBLIC_ID")
echo "get http=$CODE body=$(cat /tmp/retain-gone.json)"
python3 - <<'PY'
import json
d=json.load(open("/tmp/retain-gone.json"))
assert d.get("errorCode") == "DOCUMENT_EXPIRED", d
print("DOCUMENT_EXPIRED ok")
PY
[[ "$CODE" == "410" ]]

echo "RETENTION TEST OK"
