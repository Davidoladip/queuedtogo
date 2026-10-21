#!/usr/bin/env bash
# Runs every migration plus the RLS tests on a throwaway local PostgreSQL database.
# Needs PostgreSQL 15+ and psql. Uses a Supabase stand-in (supabase/tests/00_supabase_stub.sql).
#   DATABASE_URL=postgres://postgres@localhost:5432/postgres npm run test:db
set -euo pipefail
cd "$(dirname "$0")/.."
ADMIN_URL="${DATABASE_URL:-postgres://postgres@localhost:5432/postgres}"
DB="qtg_test_$$"
psql "$ADMIN_URL" -qtAc "create database $DB" >/dev/null
trap 'psql "$ADMIN_URL" -qtAc "drop database if exists $DB with (force)" >/dev/null' EXIT
TEST_URL="${ADMIN_URL%/*}/$DB"
run() { psql "$TEST_URL" -q -v ON_ERROR_STOP=1 -f "$1" >/dev/null; echo "  ok  $1"; }

echo "Supabase stand-in"; run supabase/tests/00_supabase_stub.sql
echo "Migrations"; for f in supabase/migrations/*.sql; do run "$f"; done
echo "RLS and audit tests"
psql "$TEST_URL" -q -v ON_ERROR_STOP=1 -f supabase/tests/10_rls_test.sql >/dev/null
psql "$TEST_URL" -tAc "select '  PASS ' || label from tests.passed order by n"
echo "  $(psql "$TEST_URL" -tAc 'select count(*) from tests.passed') checks passed"
