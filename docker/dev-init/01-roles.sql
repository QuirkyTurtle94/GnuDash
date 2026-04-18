-- Dev-only role bootstrap. Runs once when the postgres container is first
-- created (docker-entrypoint-initdb.d). If you want a clean slate, tear
-- down with `docker compose down -v` — removes the volume and this reruns.
--
-- Runs as the POSTGRES_USER (gnudash_migrator) against POSTGRES_DB (gnudash),
-- so the migrator role already exists — we only need to add the app role
-- and lock down the public schema.

CREATE ROLE gnudash_app WITH LOGIN PASSWORD 'testapppass'
  NOSUPERUSER NOCREATEDB NOCREATEROLE;

-- Least-privilege knobs — these stick inside any transaction.
ALTER ROLE gnudash_app SET statement_timeout = '10s';
ALTER ROLE gnudash_app SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE gnudash_app SET lock_timeout = '5s';

-- Lock down the public schema so the app role can't create objects there.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM gnudash_app;
GRANT USAGE ON SCHEMA public TO gnudash_app;
