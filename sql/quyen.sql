-- Run after sql/z_02_views.sql: recreated views do not inherit old object grants.
-- Reapply this file after creating/recreating the banking schema and views.
GRANT USAGE ON SCHEMA banking, banking_api TO d4_banking;

GRANT SELECT, INSERT, UPDATE
ON ALL TABLES IN SCHEMA banking TO d4_banking;

GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA banking TO d4_banking;
