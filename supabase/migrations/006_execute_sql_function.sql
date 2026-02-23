-- Generic SQL execution function callable via supabase-js .rpc().
-- security invoker = runs as the authenticated user, so RLS policies apply.

create or replace function execute_sql(query text)
returns jsonb
language plpgsql
security invoker
set search_path = 'public'
as $$
declare
  result jsonb;
begin
  execute format(
    'select coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb) from (%s) t',
    query
  ) into result;
  return result;
end;
$$;

revoke execute on function execute_sql from public;
revoke execute on function execute_sql from anon;
grant execute on function execute_sql to authenticated;
