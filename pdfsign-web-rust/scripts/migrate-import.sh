#!/usr/bin/env bash
# Import into a NEW empty pdfsign-web database (staging only).
set -euo pipefail
TARGET_URL="${TARGET_DATABASE_URL:-}"
DUMP="${1:-./migration-export/cloud-core.dump.sql}"
if [[ -z "$TARGET_URL" ]]; then
  echo "Set TARGET_DATABASE_URL to the new staging DB."
  exit 1
fi
if [[ "$TARGET_URL" == *"prod"* || "$TARGET_URL" == *"railway"* ]]; then
  echo "Refusing production-looking URL."
  exit 1
fi
echo "Import requires a hand-written transform (Prisma names -> snake_case)."
echo "Dump path: $DUMP"
echo "See docs/WEB-PLAN.md §6. This stub refuses to auto-apply."
exit 2
