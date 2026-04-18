-- Dev-only grants — runs after 02-schema.sql has created `gnudash_book`
-- and all its tables. Gives the app role day-to-day CRUD access.
--
-- In production you'd run this by hand after applying migrations, not as
-- an init hook — because production migrations might add new tables in
-- new schemas that need their own grants.

GRANT USAGE ON SCHEMA gnudash_book TO gnudash_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA gnudash_book TO gnudash_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA gnudash_book TO gnudash_app;

-- Future tables added under `gnudash_book` should inherit the same grants
-- automatically — no need to rerun this when a migration adds a table.
ALTER DEFAULT PRIVILEGES IN SCHEMA gnudash_book
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gnudash_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA gnudash_book
  GRANT USAGE ON SEQUENCES TO gnudash_app;
