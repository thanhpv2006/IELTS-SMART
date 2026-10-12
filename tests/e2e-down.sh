#!/usr/bin/env bash
# Tear down the E2E stack. Data is ephemeral (postgres + minio use tmpfs, no
# named volumes), so a plain `down` already discards all state. We also pass
# --volumes + --remove-orphans to be thorough and prune anything stray.
#
# Usage:  ./tests/e2e-down.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Tearing down E2E stack (ephemeral)..."
docker compose -f docker-compose.e2e.yml down --volumes --remove-orphans
echo "==> Done. All E2E containers + data removed."
