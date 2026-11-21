#!/usr/bin/env bash
# Read-only export from a SOURCE Postgres (staging snapshot). NEVER point at production.
set -euo pipefail
SRC_URL="${SOURCE_DATABASE_URL:-}"
OUT_DIR="${1:-./migration-export}"
if [[ -z "$SRC_URL" ]]; then
  echo "Set SOURCE_DATABASE_URL to a staging/read-replica URL (not production)."
  exit 1
fi
if [[ "$SRC_URL" == *"prod"* || "$SRC_URL" == *"railway"* ]]; then
  echo "Refusing URL that looks like production. Use an explicit staging snapshot."
  exit 1
fi
mkdir -p "$OUT_DIR"
echo "Exporting (data-only) to $OUT_DIR …"
pg_dump "$SRC_URL" --data-only --no-owner --no-privileges \
  -t '"User"' -t '"Document"' -t '"DocumentVersion"' -t '"SigningJob"' \
  -f "$OUT_DIR/cloud-core.dump.sql" || \
pg_dump "$SRC_URL" --data-only --no-owner --no-privileges \
  -f "$OUT_DIR/full-data.dump.sql"
echo "Done. Review files before import. Do not run against prod."
