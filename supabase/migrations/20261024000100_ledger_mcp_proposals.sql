-- Durable prepare/confirm/commit for ledger entries made through the MCP server.
--
-- Why this lives in the database and not in process memory: the MCP endpoint
-- runs as stateless serverless invocations, so a proposal prepared by one
-- invocation must be committable by another, a retried commit must not write a
-- second entry, and a crash between "insert the entry" and "mark it committed"
-- must not be possible. One SQL function does the whole commit in one
-- transaction under a row lock, which gives all three.
--
-- What a ledger entry means is NOT decided here. The entry is inserted into
-- public.general_ledger exactly as the web app's POST /api/general-ledger
-- inserts it, so the existing triggers compute the running balance and mirror
-- vendor entries into vendor_ledger.
--
-- Not reachable from the client roles: RLS is on with no policies, privileges
-- are revoked from anon/authenticated, and the function is executable by the
-- service role only. The API server is the only caller.

-- ---------------------------------------------------------------- proposals
create table if not exists public.ledger_mcp_proposals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,

  -- The normalized entry, exactly the columns that will be inserted. Money is
  -- a decimal string ("5000.00"), never a float.
  payload          jsonb not null,
  -- Derived by the database from the payload (trigger below), so it cannot drift
  -- from it. A generated column is refused here: jsonb::text and convert_to are
  -- only STABLE, and a generation expression must be IMMUTABLE.
  payload_hash     text not null default '',

  -- Caller-supplied retry key. Unique per user: the same key with the same
  -- payload returns the same proposal; the same key with a different payload
  -- is a conflict.
  idempotency_key  text check (idempotency_key is null or length(idempotency_key) between 8 and 128),

  status           text not null default 'pending'
                     check (status in ('pending', 'committed')),
  expires_at       timestamptz not null,
  ledger_entry_id  uuid references public.general_ledger (id) on delete set null,
  committed_at     timestamptz,
  created_at       timestamptz not null default now(),

  constraint ledger_mcp_committed_has_entry
    check (status <> 'committed' or committed_at is not null)
);

create unique index if not exists ledger_mcp_proposals_idempotency
  on public.ledger_mcp_proposals (user_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists ledger_mcp_proposals_user_created
  on public.ledger_mcp_proposals (user_id, created_at desc);

-- The hash is recomputed from the payload on every insert and on any change to
-- it, so no caller can store a hash that does not match.
create or replace function public.ledger_mcp_set_payload_hash()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.payload_hash := encode(sha256(convert_to(new.payload::text, 'UTF8')), 'hex');
  return new;
end;
$$;

revoke all on function public.ledger_mcp_set_payload_hash() from public, anon, authenticated;

drop trigger if exists trg_ledger_mcp_payload_hash on public.ledger_mcp_proposals;
create trigger trg_ledger_mcp_payload_hash
  before insert or update on public.ledger_mcp_proposals
  for each row execute function public.ledger_mcp_set_payload_hash();

-- ---------------------------------------------------------------- audit
-- Who did what and how it ended. Deliberately no amounts, descriptions,
-- customer names or tokens: ids and outcome codes are enough to reconstruct
-- an event, and the financial detail already lives in the ledger itself.
create table if not exists public.ledger_mcp_audit (
  id               bigint generated always as identity primary key,
  at               timestamptz not null default now(),
  user_id          uuid,
  action           text not null,
  outcome          text not null,
  proposal_id      uuid,
  ledger_entry_id  uuid
);

create index if not exists ledger_mcp_audit_at on public.ledger_mcp_audit (at desc);

alter table public.ledger_mcp_proposals enable row level security;
alter table public.ledger_mcp_audit     enable row level security;

revoke all on table public.ledger_mcp_proposals from public, anon, authenticated;
revoke all on table public.ledger_mcp_audit     from public, anon, authenticated;
grant  all on table public.ledger_mcp_proposals to service_role;
grant  all on table public.ledger_mcp_audit     to service_role;

-- ---------------------------------------------------------------- commit
-- Returns a jsonb { status, ... }. Statuses:
--   committed          the entry was written by this call
--   already_committed  an earlier call wrote it; nothing was written now
--   not_found          no such proposal for this user (also: someone else's)
--   expired            the proposal outlived its confirmation window
--   forbidden          the user is not an admin
-- Any other failure raises and rolls the whole call back, leaving the proposal
-- pending and the ledger untouched.
create or replace function public.commit_ledger_proposal(p_proposal_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p       public.ledger_mcp_proposals;
  v_entry public.general_ledger;
begin
  -- Permission is re-checked here, at commit, not trusted from prepare time.
  if not exists (select 1 from public.users u where u.id = p_user_id and u.role = 'admin') then
    insert into public.ledger_mcp_audit (user_id, action, outcome, proposal_id)
    values (p_user_id, 'commit', 'forbidden', p_proposal_id);
    return jsonb_build_object('status', 'forbidden');
  end if;

  -- The row lock serialises concurrent commits of the same proposal: the second
  -- one waits, then sees status = 'committed' and writes nothing.
  select * into p
    from public.ledger_mcp_proposals
   where id = p_proposal_id and user_id = p_user_id
     for update;

  if not found then
    insert into public.ledger_mcp_audit (user_id, action, outcome, proposal_id)
    values (p_user_id, 'commit', 'not_found', p_proposal_id);
    return jsonb_build_object('status', 'not_found');
  end if;

  if p.status = 'committed' then
    insert into public.ledger_mcp_audit (user_id, action, outcome, proposal_id, ledger_entry_id)
    values (p_user_id, 'commit', 'already_committed', p.id, p.ledger_entry_id);
    return jsonb_build_object('status', 'already_committed', 'ledger_entry_id', p.ledger_entry_id);
  end if;

  if p.expires_at <= now() then
    insert into public.ledger_mcp_audit (user_id, action, outcome, proposal_id)
    values (p_user_id, 'commit', 'expired', p.id);
    return jsonb_build_object('status', 'expired');
  end if;

  insert into public.general_ledger
         (entry_date, particulars, debit, credit, entry_type, notes, vendor_id)
  values ((p.payload ->> 'entry_date')::date,
          p.payload ->> 'particulars',
          (p.payload ->> 'debit')::numeric(12, 2),
          (p.payload ->> 'credit')::numeric(12, 2),
          p.payload ->> 'entry_type',
          p.payload ->> 'notes',
          (p.payload ->> 'vendor_id')::uuid)
  returning * into v_entry;

  update public.ledger_mcp_proposals
     set status = 'committed', ledger_entry_id = v_entry.id, committed_at = now()
   where id = p.id;

  insert into public.ledger_mcp_audit (user_id, action, outcome, proposal_id, ledger_entry_id)
  values (p_user_id, 'commit', 'committed', p.id, v_entry.id);

  return jsonb_build_object('status', 'committed', 'ledger_entry_id', v_entry.id);
end;
$$;

revoke all on function public.commit_ledger_proposal(uuid, uuid) from public, anon, authenticated;
grant execute on function public.commit_ledger_proposal(uuid, uuid) to service_role;

-- ---------------------------------------------------------------- assert
do $$
begin
  if has_table_privilege('authenticated', 'public.ledger_mcp_proposals', 'SELECT')
     or has_table_privilege('anon', 'public.ledger_mcp_proposals', 'SELECT')
     or has_table_privilege('authenticated', 'public.ledger_mcp_audit', 'SELECT') then
    raise exception 'MCP proposal tables are readable by client roles';
  end if;

  if has_function_privilege('authenticated', 'public.commit_ledger_proposal(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.commit_ledger_proposal(uuid, uuid)', 'EXECUTE') then
    raise exception 'commit_ledger_proposal is callable by client roles';
  end if;

  if not has_function_privilege('service_role', 'public.commit_ledger_proposal(uuid, uuid)', 'EXECUTE') then
    raise exception 'service_role cannot run commit_ledger_proposal';
  end if;

  raise notice 'ledger MCP proposals installed';
end $$;
