#!/usr/bin/env bash
#
# Starts Vuka on a Mac with no Docker: a portable Postgres under ~/.vuka, then the backend.
# The counterpart of run-local.ps1. For a developer laptop only; not a deployment mechanism.
#
#   ./run-local.sh            Firebase sign in
#   ./run-local.sh --dev-auth development sign in as well (never anywhere reachable by others)
#
# Then, in a second terminal: cd frontend && npm run dev
#
# Postgres runs on 5433 rather than 5432 so it cannot collide with another local Postgres. The
# database survives restarts; delete ~/.vuka/pgdata to start again from the seed, and note that a
# fresh seed gives every entity a new id, so a reporter account's entityId claim must be reset.
#
# Firebase: point FIREBASE_CREDENTIALS at the service account key before running, or sign in
# only works with --dev-auth.

set -euo pipefail

VUKA_HOME="${VUKA_HOME:-$HOME/.vuka}"
PG="$VUKA_HOME/postgres/bin"
PGDATA="$VUKA_HOME/pgdata"
PGPORT="${PGPORT:-5433}"

if [[ ! -x "$PG/pg_ctl" ]]; then
  echo "No Postgres at $PG. Install PostgreSQL 16 there, or set VUKA_HOME." >&2
  exit 1
fi

if [[ ! -d "$PGDATA" ]]; then
  printf 'vuka\n' > "$VUKA_HOME/pw" && chmod 600 "$VUKA_HOME/pw"
  "$PG/initdb" -D "$PGDATA" -U vuka --pwfile="$VUKA_HOME/pw" -A md5 >/dev/null
fi

if ! "$PG/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
  "$PG/pg_ctl" -D "$PGDATA" -l "$VUKA_HOME/postgres.log" \
    -o "-p $PGPORT -c listen_addresses=localhost" start >/dev/null
fi

# The vuka database, created once. Postgres ships no client here, so this asks the server itself.
export DB_URL="jdbc:postgresql://localhost:$PGPORT/vuka"
DRIVER=$(ls "$HOME"/.m2/repository/org/postgresql/postgresql/*/postgresql-*.jar 2>/dev/null | tail -1 || true)
if [[ -n "$DRIVER" ]]; then
  MK=$(mktemp -d)/MkVuka.java
  cat > "$MK" <<EOF
import java.sql.*;
public class MkVuka { public static void main(String[] a) throws Exception {
  try (Connection c = DriverManager.getConnection("jdbc:postgresql://localhost:$PGPORT/postgres", "vuka", "vuka");
       Statement s = c.createStatement()) {
    if (!s.executeQuery("select 1 from pg_database where datname = 'vuka'").next()) s.execute("create database vuka");
  } } }
EOF
  java -cp "$DRIVER" "$MK"
fi

export DOCUMENT_ROOT="${DOCUMENT_ROOT:-$VUKA_HOME/documents}"
export VUKA_DEMO_OUTPUT_DIR="${VUKA_DEMO_OUTPUT_DIR:-$VUKA_HOME/demo}"
if [[ "${1:-}" == "--dev-auth" ]]; then export VUKA_DEV_AUTH=true; fi

cd "$(dirname "$0")"
exec ./mvnw spring-boot:run
