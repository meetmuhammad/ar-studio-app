-- Binds ledger MCP access tokens to the MCP endpoint (RFC 8707 audience binding).
--
-- Supabase's OAuth 2.1 server does not implement RFC 8707 resource indicators. Its
-- documented way to bind a token to a service is a Custom Access Token Hook that
-- sets `aud` per client_id (docs: auth/oauth-server/token-security). This hook sets
-- aud to the MCP endpoint URL for registered ledger clients ONLY; every other token
-- (web sessions, other clients) is returned unchanged.
--
-- Applying this file creates the table and function but does NOT turn the hook on.
-- Enable it under Authentication > Hooks (or [auth.hook.custom_access_token] locally).
-- Hooks run for all token issuance, so it must stay cheap and must not raise.
-- Rollback: disable the hook first, then
--   drop function public.ledger_mcp_access_token_hook(jsonb);
--   drop table public.ledger_mcp_clients;

create table if not exists public.ledger_mcp_clients (
  client_id text primary key,
  audience  text not null check (audience ~ '^https://')
);
alter table public.ledger_mcp_clients enable row level security;
revoke all on public.ledger_mcp_clients from public, anon, authenticated;
grant select on public.ledger_mcp_clients to supabase_auth_admin;
-- supabase_auth_admin does not bypass RLS; without this policy the hook sees no rows
-- and silently leaves aud unchanged.
drop policy if exists ledger_mcp_clients_auth_admin_read on public.ledger_mcp_clients;
create policy ledger_mcp_clients_auth_admin_read on public.ledger_mcp_clients
  for select to supabase_auth_admin using (true);

create or replace function public.ledger_mcp_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_aud text;
begin
  select audience into v_aud
    from public.ledger_mcp_clients
   where client_id = event -> 'claims' ->> 'client_id';

  if v_aud is not null then
    event := jsonb_set(event, '{claims,aud}', to_jsonb(v_aud));
  end if;
  return event;
end;
$$;

revoke all on function public.ledger_mcp_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.ledger_mcp_access_token_hook(jsonb) to supabase_auth_admin;
