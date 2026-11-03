#!/usr/bin/env bash
set -euo pipefail
# PostgreSQL 16+ reserves SYSTEM_USER. Quote only the existing FK target;
# the immutable source DDL and the resulting table/constraint definitions stay intact.
sql_dir="${BANKING_SQL_DIR:-/banking-sql}"
sed -E 's/REFERENCES system_user\(/REFERENCES "system_user"(/g' "$sql_dir/create_table.sql" |
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"
for script in "$sql_dir"/z_*.sql; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --file "$script"
done
