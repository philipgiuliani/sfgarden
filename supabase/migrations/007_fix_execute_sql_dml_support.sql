-- Fix execute_sql to support DML statements (INSERT/UPDATE/DELETE) with CTEs.
-- The previous implementation wrapped the query as a subquery, which PostgreSQL
-- forbids for CTEs containing data-modifying statements.
-- This version uses a temp table so the user's query runs at the top level.

create or replace function execute_sql(query text)
returns jsonb
language plpgsql
security invoker
set search_path = 'public'
as $$
declare
  result jsonb;
begin
  drop table if exists _sqlexec_result;
  execute 'create temp table _sqlexec_result as ' || query;
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    into result
    from _sqlexec_result t;
  drop table _sqlexec_result;
  return result;
end;
$$;
