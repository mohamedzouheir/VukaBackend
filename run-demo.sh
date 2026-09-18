#!/usr/bin/env bash
#
# Starts the backend for a demonstration on a laptop with Postgres already running on 5432 and no
# Docker. Development sign in is on, so never run this anywhere another person can reach.
#
#   ./run-demo.sh             backend on 8080, against the vuka_demo database
#   ./run-demo.sh --reset     drop and recreate vuka_demo first, back to the seeded demo state
#
# Then, in a second terminal:
#
#   cd frontend && VITE_DEV_AUTH=true npm run dev      # http://localhost:5173
#
# The demo database is separate from any other database on the server, so resetting it touches
# nothing else. The demo account uids are the development sign in's, so "my tasks" finds the
# seeded work for each role. Documents and the Q2 template land under ~/.vuka.

set -euo pipefail
cd "$(dirname "$0")"

PGHOST_URL="${PGHOST_URL:-jdbc:postgresql://localhost:5432}"
DRIVER=$(ls "$HOME"/.m2/repository/org/postgresql/postgresql/*/postgresql-*.jar 2>/dev/null | tail -1 || true)
if [[ -z "$DRIVER" ]]; then
  echo "No Postgres JDBC driver in ~/.m2. Run ./mvnw -q compile once first." >&2
  exit 1
fi

RESET=false
if [[ "${1:-}" == "--reset" ]]; then RESET=true; fi

# Postgres ships no client here, so the database is made through the JDBC driver.
MK=$(mktemp -d)/MkDemo.java
cat > "$MK" <<EOF
import java.sql.*;
public class MkDemo { public static void main(String[] a) throws Exception {
  try (Connection c = DriverManager.getConnection("$PGHOST_URL/postgres", "vuka", "vuka");
       Statement s = c.createStatement()) {
    if ($RESET) {
      s.execute("select pg_terminate_backend(pid) from pg_stat_activity where datname = 'vuka_demo'");
      s.execute("drop database if exists vuka_demo");
    }
    if (!s.executeQuery("select 1 from pg_database where datname = 'vuka_demo'").next()) s.execute("create database vuka_demo");
  } } }
EOF
java -cp "$DRIVER" "$MK"

if $RESET; then rm -rf "$HOME/.vuka/demo-documents" "$HOME/.vuka/demo"; fi
mkdir -p "$HOME/.vuka/demo-documents" "$HOME/.vuka/demo"

export VUKA_DEV_AUTH=true
export DB_URL="$PGHOST_URL/vuka_demo"
export DOCUMENT_ROOT="$HOME/.vuka/demo-documents"
export VUKA_DEMO_OUTPUT_DIR="$HOME/.vuka/demo"
export VUKA_DEMO_REPORTER_UID=dev-entity_reporter
export VUKA_DEMO_REVIEWER_UID=dev-dsac_reviewer
export VUKA_DEMO_EXECUTIVE_UID=dev-dsac_executive
export VUKA_DEMO_ADMIN_UID=dev-admin

exec ./mvnw -q spring-boot:run
