#!/usr/bin/env bash
# One-command deploy/update on the server. Run from the repo root.
set -euo pipefail

echo "▶ Pulling latest…"
git pull

echo "▶ Building + starting the stack…"
docker compose -f docker-compose.prod.yml up -d --build

echo "▶ Waiting for the API to become healthy…"
sleep 5
docker compose -f docker-compose.prod.yml ps

echo "✅ Deployed. First deploy? Seed demo data with:"
echo "   docker compose -f docker-compose.prod.yml exec api pnpm --filter @navastar/db seed"
