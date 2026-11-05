#!/usr/bin/env bash
# One-time restore of the Render workspace into a local PostgreSQL database.
# The desktop app does not use this restore as its only copy. While it is open
# it repeats the same Render exchange every 90 seconds, and again when the
# local SQLite database gains or changes a quote or proposal.
# The connection string is read from scripts/render-database.url (gitignored).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL_FILE="$ROOT/scripts/render-database.url"
DUMP_FILE="$ROOT/render_db.dump"
LOCAL_URL="postgresql://postgres:postgres@localhost:5432/weott_nexus"
ENV_FILE="$ROOT/artifacts/pdf-engine/.env"

if [[ ! -f "$URL_FILE" ]]; then
  echo "Missing $URL_FILE" >&2
  exit 1
fi

RENDER_URL="$(tr -d '\r\n' < "$URL_FILE")"
if [[ -z "$RENDER_URL" ]]; then
  echo "Render database URL is empty" >&2
  exit 1
fi

echo "Downloading Render database to render_db.dump"
pg_dump -F c --no-owner --no-acl --dbname="$RENDER_URL" -f "$DUMP_FILE"

echo "Creating local database weott_nexus if needed"
if ! psql "postgresql://postgres:postgres@localhost:5432/postgres" -tAc "SELECT 1 FROM pg_database WHERE datname='weott_nexus'" | grep -q 1; then
  psql "postgresql://postgres:postgres@localhost:5432/postgres" -c "CREATE DATABASE weott_nexus"
fi

echo "Restoring into weott_nexus"
pg_restore --no-owner --no-acl --dbname="$LOCAL_URL" --clean --if-exists "$DUMP_FILE" || true

mkdir -p "$(dirname "$ENV_FILE")"
if [[ -f "$ENV_FILE" ]] && grep -q '^DATABASE_URL=' "$ENV_FILE"; then
  sed -i 's|^DATABASE_URL=.*|DATABASE_URL=postgresql://postgres:postgres@localhost:5432/weott_nexus|' "$ENV_FILE"
else
  printf '\nDATABASE_URL=postgresql://postgres:postgres@localhost:5432/weott_nexus\n' >> "$ENV_FILE"
fi

echo "Local DATABASE_URL now points at weott_nexus"
psql "$LOCAL_URL" -c "SELECT 'quotes' AS table_name, count(*) FROM quotes UNION ALL SELECT 'proposals', count(*) FROM proposals;"
