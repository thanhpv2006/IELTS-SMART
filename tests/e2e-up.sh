#!/usr/bin/env bash
# Bring up the "real stack" E2E infra for ielts-smart-web, run migrations,
# seed deterministic data, and wait until the API is ready.
#
# Usage:  ./tests/e2e-up.sh
# Teardown (ephemeral, wipes data): ./tests/e2e-down.sh
#
# After this prints "API ready at :8080" the four E2E accounts can log in via
# POST http://localhost:8080/api/v1/auth/login and student@e2e.local has a
# pending speaking assignment ready to take.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
COMPOSE="docker compose -f docker-compose.e2e.yml"

echo "==> Building images + starting postgres/minio/api/worker/fakes..."
# `up -d` brings everything up. The one-shot `migrate` and `seed` services run
# to completion (depends_on conditions enforce ordering) then exit; api/worker
# stay running. --wait blocks until services with healthchecks are healthy and
# one-shot services have exited successfully.
# seed/api/worker now depends_on minio-init (service_completed_successfully), so
# compose pulls it in and treats its exit(0) as expected — listing it directly in
# --wait would make compose report the one-shot's exit as a failure.
$COMPOSE up -d --build migrate seed

# CRITICAL: `--wait` can return before a one-shot service's process actually
# finishes (it treats "running" as satisfied), so tests could start against a
# HALF-SEEDED DB — the seed inserts 25 students with bcrypt cost 12 + a go-run
# compile, so it takes ~30-60s. `docker compose wait` BLOCKS until the container
# exits and returns its exit code. We block on both migrate and seed and assert
# they exited 0 before bringing up api/worker.
echo "==> Waiting for migrate + seed to FULLY complete (blocking)..."
for svc in migrate seed; do
  cid="$($COMPOSE ps -aq "$svc")"
  if [ -z "$cid" ]; then echo "ERROR: no container for '$svc'." >&2; exit 1; fi
  # Poll the container until its process exits (portable; avoids `compose wait`).
  for i in $(seq 1 120); do
    running="$(docker inspect -f '{{.State.Running}}' "$cid" 2>/dev/null || echo true)"
    [ "$running" = "false" ] && break
    sleep 1
  done
  ec="$(docker inspect -f '{{.State.ExitCode}}' "$cid" 2>/dev/null || echo 1)"
  if [ "$ec" != "0" ]; then
    echo "ERROR: '$svc' did not exit 0 (exit=$ec). Logs:" >&2
    $COMPOSE logs --tail 40 "$svc" >&2 || true
    exit 1
  fi
done

echo "==> Migrations applied, seed complete, bucket ready. Starting api + fakes..."
# Start api (and the fakes) BEFORE the worker: both api and worker run River's
# own migrations on boot, and doing it concurrently races ("river_migration
# already exists"). Letting api migrate alone first, then starting the worker,
# makes startup deterministic.
# --build here too: api/worker are separate compose services with their own images, so the
# earlier `--build migrate seed` leaves them on whatever image was cached — a backend change
# would then be seeded but never served, and the suite would grade the previous build.
$COMPOSE up -d --build api fake-ssproxy fake-openai

echo "==> Waiting for API /healthz on :8080..."
ready=0
for i in $(seq 1 60); do
  if curl -fsS http://localhost:8080/healthz >/dev/null 2>&1; then ready=1; break; fi
  sleep 2
done
if [ "$ready" -ne 1 ]; then
  echo "ERROR: API did not become ready within ~120s." >&2
  echo "Recent api logs:" >&2
  $COMPOSE logs --tail 50 api >&2 || true
  exit 1
fi

echo "==> API ready. Starting worker (River already migrated)..."
$COMPOSE up -d --build worker

echo ""
echo "API ready at :8080"
echo ""
echo "Accounts (password Test@1234):"
echo "  owner@e2e.local            (partner_owner, E2E Center, has credit)"
echo "  teacher@e2e.local          (teacher)"
echo "  student@e2e.local          (student, has credit, 1 pending speaking assignment)"
echo "  student-nocredit@e2e.local (student, partner with NO credit)"
echo ""
echo "MinIO console: http://localhost:9111  (minioadmin / minioadmin)"
echo "Teardown:      ./tests/e2e-down.sh"
exit 0
