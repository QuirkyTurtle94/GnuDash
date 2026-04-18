#!/usr/bin/env bash
# Drop the Postgres dev container and its named volume so the next
# `docker compose up -d postgres` starts from an empty database.
# Useful after a failed import or when switching between fixture books.
set -euo pipefail

cd "$(dirname "$0")/.."

docker compose down --volumes
echo "Postgres data volume 'gnudash_pgdata' destroyed."
