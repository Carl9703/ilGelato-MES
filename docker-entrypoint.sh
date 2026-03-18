#!/bin/sh
set -e

# Verify the data directory is writable (bind mount from host)
DATA_DIR=$(dirname "${DATABASE_URL#file:}")
if [ ! -w "$DATA_DIR" ]; then
  echo "ERROR: Data directory '$DATA_DIR' is not writable." >&2
  echo "On Synology, ensure /volume1/docker/ilgelato/data exists and has correct permissions." >&2
  exit 1
fi

# Push schema to database (creates tables on first run, no-op on subsequent runs)
echo "Initializing database..."
npx prisma db push --skip-generate

# Ensure default admin user exists (safe to run on every start)
echo "Ensuring admin user..."
npx tsx prisma/create-admin.ts

exec npx tsx server.ts
