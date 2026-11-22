#!/usr/bin/env bash
# Public /downloads/* is served from DOWNLOADS_DIR (independent of STORAGE_DIR).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP_URL="${APP_URL:-http://127.0.0.1:8080}"
DL_DIR="${DOWNLOADS_DIR:-$ROOT/pdfsign-web-rust/downloads}"
mkdir -p "$DL_DIR"
MARKER="$DL_DIR/PDFSign-setup.exe"
printf 'MZ-pdfsign-download-test-%s' "$(date +%s)" >"$MARKER"
trap 'rm -f "$MARKER"' EXIT

echo "== GET /downloads/PDFSign-setup.exe =="
CODE=$(curl -sS -o /tmp/pdfsign-dl.bin -w "%{http_code}" "$APP_URL/downloads/PDFSign-setup.exe")
echo "http=$CODE"
[[ "$CODE" == "200" ]]
cmp -s "$MARKER" /tmp/pdfsign-dl.bin
echo "downloads static ok"

echo "== storage path still not public without auth =="
CODE=$(curl -sS -o /tmp/pdfsign-st.bin -w "%{http_code}" "$APP_URL/api/v1/storage/documents/nope/v1.pdf")
echo "storage http=$CODE"
[[ "$CODE" != "200" ]]
echo "storage still gated ok"
