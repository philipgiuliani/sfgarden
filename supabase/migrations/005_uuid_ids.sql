-- Switch all tables to auto-generate UUIDs for new rows.
-- Existing rows keep their current IDs; only new inserts are affected.

alter table gardens alter column id set default gen_random_uuid()::text;
alter table plantings alter column id set default gen_random_uuid()::text;
alter table harvests alter column id set default gen_random_uuid()::text;
alter table seedlings alter column id set default gen_random_uuid()::text;
alter table notes alter column id set default gen_random_uuid()::text;
