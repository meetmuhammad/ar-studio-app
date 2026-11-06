-- ============================================================================
-- ARAPP-CHANGE-4: two businesses on one login (Ahsan Tariq Couture + Techlink Co)
-- ============================================================================
--
-- Client (change 4): "Run two businesses on one login: Ahsan Tariq Couture and
-- Techlink Co. After login, show both businesses and let me switch between
-- them. Techlink Co has its own separate vendors, ledger and orders. Nothing
-- mixes between the two. Same features and settings as ATC, with nothing new
-- to set up."
--
-- WHAT THIS DOES (one transaction; any failed check rolls everything back)
-- ------------------------------------------------------------------------
--  1. businesses + user_businesses. Seeds ATC (slug atc, code AR) and Techlink
--     Co (slug techlink, code TL). Nothing else is seeded for Techlink:
--     vendor_categories stay SHARED, so Techlink inherits the whole chart
--     (Employees, Purchases, Charity, ...) with zero setup. There are no other
--     per-business configuration tables.
--  2. business_id on customers, measurements, vendors, orders, payments,
--     general_ledger, vendor_ledger, ledger_mcp_proposals, ledger_mcp_audit.
--     Every existing row is backfilled to ATC, then NOT NULL + FK.
--     order_items and vendor_tags inherit through their parent (no column).
--  3. Uniques become per business: customers (business_id, phone) and
--     orders (business_id, order_number).
--  4. Cross-row guards: a child row must carry its parent's business, and
--     business_id can never change after insert.
--  5. general_ledger running balance is partitioned by business_id, with a
--     per-business advisory lock. This ships HERE, before any Techlink ledger
--     row can exist, so a Techlink write can never rewrite ATC balances.
--  6. Balances are rebuilt per business and verified against (a) an
--     independent partitioned cumulative sum and (b) the pre-migration stored
--     series. Mismatch => exception => rollback.
--  7. Memberships: every existing public.users row -> ATC; only role = 'admin'
--     -> Techlink. Staff stay ATC-only. No users are created.
--  8. RLS on the scoped tables is narrowed from "any signed-in user" to
--     "member of the row's business" (defence in depth; the API uses the
--     service role and enforces membership itself).
--
-- Techlink starts with no transactional rows and therefore an opening balance
-- of 0; no zero opening_balance row is inserted (the empty book renders fine).
-- ============================================================================

set local lock_timeout = '5s';

-- Nothing may write the scoped tables while columns, triggers and balances
-- change underneath them.
lock table public.customers, public.measurements, public.vendors, public.orders,
           public.payments, public.general_ledger, public.vendor_ledger
  in share row exclusive mode;

-- ---------------------------------------------------------------------------
-- 0. Snapshot the stored running balances before anything changes.
-- ---------------------------------------------------------------------------

create temporary table _gl_before on commit drop as
  select id, balance from public.general_ledger;
create temporary table _vl_before on commit drop as
  select id, balance from public.vendor_ledger;

-- Was the pre-migration GL series self-consistent (global cumulative sum)?
create temporary table _gl_before_consistent on commit drop as
  select count(*) = 0 as ok
    from (
      select gl.balance,
             sum(coalesce(gl.debit, 0) - coalesce(gl.credit, 0))
               over (order by gl.entry_date, gl.created_at, gl.id
                     rows between unbounded preceding and current row) as expected
        from public.general_ledger gl
    ) t
   where t.balance is distinct from t.expected;

-- ---------------------------------------------------------------------------
-- 1. businesses / user_businesses
-- ---------------------------------------------------------------------------

create table if not exists public.businesses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique check (slug ~ '^[a-z0-9-]+$'),
  -- Order-number prefix (AR-#####, TL-#####).
  code       text check (code is null or code ~ '^[A-Z]{1,5}$'),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_businesses_updated_at on public.businesses;
create trigger trg_businesses_updated_at
  before update on public.businesses
  for each row execute function public.update_updated_at_column();

create table if not exists public.user_businesses (
  user_id     uuid not null references public.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, business_id)
);
create index if not exists idx_user_businesses_business on public.user_businesses (business_id);

insert into public.businesses (name, slug, code)
values ('Ahsan Tariq Couture', 'atc', 'AR'),
       ('Techlink Co', 'techlink', 'TL')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 2. business_id columns, backfilled to ATC, then NOT NULL + FK + index
-- ---------------------------------------------------------------------------

do $$
declare
  v_atc uuid := (select id from public.businesses where slug = 'atc');
  t     text;
begin
  foreach t in array array[
    'customers', 'measurements', 'vendors', 'orders', 'payments',
    'general_ledger', 'vendor_ledger', 'ledger_mcp_proposals', 'ledger_mcp_audit'
  ] loop
    if to_regclass('public.' || t) is null then
      raise notice 'skip %: table not present', t;
      continue;
    end if;
    execute format('alter table public.%I add column if not exists business_id uuid', t);
    execute format('update public.%I set business_id = %L where business_id is null', t, v_atc);
    execute format(
      'alter table public.%I add constraint %I foreign key (business_id) references public.businesses(id) on delete restrict',
      t, t || '_business_id_fkey');
    execute format('create index if not exists %I on public.%I (business_id)', 'idx_' || t || '_business_id', t);
    -- ledger_mcp_audit also records refusals that never resolved a business,
    -- so it stays nullable; every other scoped table is NOT NULL.
    if t <> 'ledger_mcp_audit' then
      execute format('alter table public.%I alter column business_id set not null', t);
    end if;
  end loop;
end;
$$;

create index if not exists idx_general_ledger_business_chrono
  on public.general_ledger (business_id, entry_date, created_at, id);

-- ---------------------------------------------------------------------------
-- 3. Per-business uniques
-- ---------------------------------------------------------------------------

alter table public.customers drop constraint if exists customers_phone_key;
alter table public.customers
  add constraint customers_business_phone_key unique (business_id, phone);

alter table public.orders drop constraint if exists orders_order_number_key;
alter table public.orders
  add constraint orders_business_order_number_key unique (business_id, order_number);

-- ---------------------------------------------------------------------------
-- 4. Cross-row business guards
-- ---------------------------------------------------------------------------
--
-- One function, branching on the table. On INSERT a child row with no
-- business_id takes its parent's; a child row whose business_id disagrees with
-- its parent is refused. On UPDATE business_id is immutable (no "move a row to
-- the other business" path exists or is wanted).

create or replace function public.enforce_business_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent uuid;
begin
  if tg_op = 'UPDATE' and new.business_id is distinct from old.business_id then
    raise exception '%.business_id cannot change after insert', tg_table_name
      using errcode = 'check_violation';
  end if;

  if tg_table_name = 'measurements' then
    select c.business_id into v_parent from public.customers c where c.id = new.customer_id;
    new.business_id := coalesce(new.business_id, v_parent);
    if v_parent is distinct from new.business_id then
      raise exception 'measurement and customer belong to different businesses' using errcode = 'check_violation';
    end if;

  elsif tg_table_name = 'orders' then
    select c.business_id into v_parent from public.customers c where c.id = new.customer_id;
    new.business_id := coalesce(new.business_id, v_parent);
    if v_parent is distinct from new.business_id then
      raise exception 'order and customer belong to different businesses' using errcode = 'check_violation';
    end if;
    if new.measurement_id is not null and not exists (
      select 1 from public.measurements m
       where m.id = new.measurement_id and m.business_id = new.business_id
    ) then
      raise exception 'order and measurement belong to different businesses' using errcode = 'check_violation';
    end if;

  elsif tg_table_name = 'payments' then
    select o.business_id into v_parent from public.orders o where o.id = new.order_id;
    new.business_id := coalesce(new.business_id, v_parent);
    if v_parent is distinct from new.business_id then
      raise exception 'payment and order belong to different businesses' using errcode = 'check_violation';
    end if;
    if not exists (
      select 1 from public.customers c
       where c.id = new.customer_id and c.business_id = new.business_id
    ) then
      raise exception 'payment and customer belong to different businesses' using errcode = 'check_violation';
    end if;

  elsif tg_table_name = 'general_ledger' then
    if new.vendor_id is not null and not exists (
      select 1 from public.vendors v
       where v.id = new.vendor_id and v.business_id = new.business_id
    ) then
      raise exception 'ledger entry and vendor belong to different businesses' using errcode = 'check_violation';
    end if;
    if new.order_id is not null and not exists (
      select 1 from public.orders o
       where o.id = new.order_id and o.business_id = new.business_id
    ) then
      raise exception 'ledger entry and order belong to different businesses' using errcode = 'check_violation';
    end if;

  elsif tg_table_name = 'vendor_ledger' then
    select v.business_id into v_parent from public.vendors v where v.id = new.vendor_id;
    new.business_id := coalesce(new.business_id, v_parent);
    if v_parent is distinct from new.business_id then
      raise exception 'vendor ledger entry and vendor belong to different businesses' using errcode = 'check_violation';
    end if;
    if new.general_ledger_id is not null and not exists (
      select 1 from public.general_ledger gl
       where gl.id = new.general_ledger_id and gl.business_id = new.business_id
    ) then
      raise exception 'vendor ledger entry and ledger entry belong to different businesses' using errcode = 'check_violation';
    end if;
  end if;
  -- customers, vendors: top-level rows; only the immutability check applies.

  return new;
end;
$$;

revoke all on function public.enforce_business_scope() from public, anon, authenticated;

-- "trg_0a_" sorts before every existing trigger name, so the guard (and the
-- business_id it fills in) runs before balance and snapshot triggers.
-- UPDATE guards fire only when a scoping column changes, so the balance-only
-- writes of the recalculation do not pay for them.
drop trigger if exists trg_0a_business_scope_ins on public.customers;
drop trigger if exists trg_0a_business_scope_upd on public.customers;
create trigger trg_0a_business_scope_upd before update on public.customers
  for each row when (new.business_id is distinct from old.business_id)
  execute function public.enforce_business_scope();

drop trigger if exists trg_0a_business_scope_upd on public.vendors;
create trigger trg_0a_business_scope_upd before update on public.vendors
  for each row when (new.business_id is distinct from old.business_id)
  execute function public.enforce_business_scope();

drop trigger if exists trg_0a_business_scope_ins on public.measurements;
drop trigger if exists trg_0a_business_scope_upd on public.measurements;
create trigger trg_0a_business_scope_ins before insert on public.measurements
  for each row execute function public.enforce_business_scope();
create trigger trg_0a_business_scope_upd before update on public.measurements
  for each row when (new.business_id is distinct from old.business_id
                  or new.customer_id is distinct from old.customer_id)
  execute function public.enforce_business_scope();

drop trigger if exists trg_0a_business_scope_ins on public.orders;
drop trigger if exists trg_0a_business_scope_upd on public.orders;
create trigger trg_0a_business_scope_ins before insert on public.orders
  for each row execute function public.enforce_business_scope();
create trigger trg_0a_business_scope_upd before update on public.orders
  for each row when (new.business_id is distinct from old.business_id
                  or new.customer_id is distinct from old.customer_id
                  or new.measurement_id is distinct from old.measurement_id)
  execute function public.enforce_business_scope();

drop trigger if exists trg_0a_business_scope_ins on public.payments;
drop trigger if exists trg_0a_business_scope_upd on public.payments;
create trigger trg_0a_business_scope_ins before insert on public.payments
  for each row execute function public.enforce_business_scope();
create trigger trg_0a_business_scope_upd before update on public.payments
  for each row when (new.business_id is distinct from old.business_id
                  or new.order_id is distinct from old.order_id
                  or new.customer_id is distinct from old.customer_id)
  execute function public.enforce_business_scope();

drop trigger if exists trg_0a_business_scope_ins on public.general_ledger;
drop trigger if exists trg_0a_business_scope_upd on public.general_ledger;
create trigger trg_0a_business_scope_ins before insert on public.general_ledger
  for each row execute function public.enforce_business_scope();
create trigger trg_0a_business_scope_upd before update on public.general_ledger
  for each row when (new.business_id is distinct from old.business_id
                  or new.vendor_id is distinct from old.vendor_id
                  or new.order_id is distinct from old.order_id)
  execute function public.enforce_business_scope();

drop trigger if exists trg_0a_business_scope_ins on public.vendor_ledger;
drop trigger if exists trg_0a_business_scope_upd on public.vendor_ledger;
create trigger trg_0a_business_scope_ins before insert on public.vendor_ledger
  for each row execute function public.enforce_business_scope();
create trigger trg_0a_business_scope_upd before update on public.vendor_ledger
  for each row when (new.business_id is distinct from old.business_id
                  or new.vendor_id is distinct from old.vendor_id
                  or new.general_ledger_id is distinct from old.general_ledger_id)
  execute function public.enforce_business_scope();

-- ---------------------------------------------------------------------------
-- 5. general_ledger running balance, partitioned by business
-- ---------------------------------------------------------------------------
--
-- Same algorithm as 20261101000000_ledger_running_balance_integrity, with
-- every read and write restricted to one business_id. Each business is its
-- own book: its first row starts from 0 and no other business's rows are ever
-- read or rewritten.
--
-- LOCKING. The advisory lock key is per business:
--   hashtext('public.general_ledger.balance:' || business_id)
-- so ATC and Techlink writers neither serialise on each other nor rebuild each
-- other's series. A statement-level BEFORE trigger cannot see which business a
-- statement touches, so the global statement lock from 20261101000000 is
-- replaced by a BEFORE ROW lock on the row's business. Trade-off: two
-- concurrent UPDATE/DELETEs in the SAME business that each hit rows the other's
-- recalculation rewrites can now deadlock; Postgres detects that (40P01) and
-- aborts one statement, which the user retries. INSERT, the common write, takes
-- the lock before any ledger row is locked and cannot deadlock this way.

-- Old global versions go: nothing may call a whole-table recalculation.
drop trigger if exists trg_lock_general_ledger_writes on public.general_ledger;
drop function if exists public.lock_general_ledger_writes();
drop function if exists public.recalculate_ledger_balances_from(date, timestamptz, uuid);

create or replace function public.general_ledger_lock_key(p_business_id uuid)
returns bigint
language sql
immutable
set search_path = public, pg_temp
as $$
  select hashtext('public.general_ledger.balance:' || p_business_id::text)::bigint
$$;

create or replace function public.lock_general_ledger_business()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Re-entrant within a transaction, released at COMMIT/ROLLBACK.
  if tg_op = 'DELETE' then
    perform pg_advisory_xact_lock(public.general_ledger_lock_key(old.business_id));
    return old;
  end if;
  perform pg_advisory_xact_lock(public.general_ledger_lock_key(new.business_id));
  return new;
end;
$$;

-- "trg_0b_" runs after the scope guard (which may still reject the row) and
-- before trg_calculate_general_ledger_balance reads the predecessor.
drop trigger if exists trg_0b_lock_general_ledger_business_ins on public.general_ledger;
drop trigger if exists trg_0b_lock_general_ledger_business_upd on public.general_ledger;
drop trigger if exists trg_0b_lock_general_ledger_business_del on public.general_ledger;
create trigger trg_0b_lock_general_ledger_business_ins
  before insert on public.general_ledger
  for each row execute function public.lock_general_ledger_business();
-- Only writes that move a row in its book or change its amount need the lock;
-- the recalculation's own balance-only writes already hold it.
create trigger trg_0b_lock_general_ledger_business_upd
  before update on public.general_ledger
  for each row when (new.debit is distinct from old.debit
                  or new.credit is distinct from old.credit
                  or new.entry_date is distinct from old.entry_date
                  or new.created_at is distinct from old.created_at)
  execute function public.lock_general_ledger_business();
create trigger trg_0b_lock_general_ledger_business_del
  before delete on public.general_ledger
  for each row execute function public.lock_general_ledger_business();

create or replace function public.recalculate_ledger_balances_from(
  p_business_id uuid,
  p_entry_date  date,
  p_created_at  timestamptz,
  p_id          uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_previous numeric(12,2);
  v_changed  integer := 0;
begin
  if p_business_id is null or p_id is null then
    return 0;
  end if;
  -- Re-entrancy guard (transaction-local, released at COMMIT/ROLLBACK).
  if coalesce(current_setting('ar.ledger_recalc', true), 'off') = 'on' then
    return 0;
  end if;
  perform pg_advisory_xact_lock(public.general_ledger_lock_key(p_business_id));
  perform set_config('ar.ledger_recalc', 'on', true);

  -- Balance carried in from the last row OF THIS BUSINESS strictly before the
  -- anchor position.
  select gl.balance
    into v_previous
    from public.general_ledger gl
   where gl.business_id = p_business_id
     and (gl.entry_date, gl.created_at, gl.id) < (p_entry_date, p_created_at, p_id)
   order by gl.entry_date desc, gl.created_at desc, gl.id desc
   limit 1;

  v_previous := coalesce(v_previous, 0);

  with ordered as (
    select gl.id,
           v_previous
             + sum(coalesce(gl.debit, 0) - coalesce(gl.credit, 0))
               over (order by gl.entry_date, gl.created_at, gl.id
                     rows between unbounded preceding and current row)
             as new_balance
      from public.general_ledger gl
     where gl.business_id = p_business_id
       and (gl.entry_date, gl.created_at, gl.id) >= (p_entry_date, p_created_at, p_id)
  ),
  applied as (
    update public.general_ledger gl
       set balance = ordered.new_balance
      from ordered
     where gl.id = ordered.id
       and gl.business_id = p_business_id
       and gl.balance is distinct from ordered.new_balance
    returning 1
  )
  select count(*) into v_changed from applied;

  perform set_config('ar.ledger_recalc', 'off', true);
  return v_changed;
end;
$$;

comment on function public.recalculate_ledger_balances_from(uuid, date, timestamptz, uuid) is
  'Rewrites general_ledger.balance for every row OF ONE BUSINESS at or after the (entry_date, created_at, id) anchor. Returns rows changed. Touches only the balance column.';

drop function if exists public.rebuild_general_ledger_balances();
drop function if exists public.rebuild_general_ledger_balances(uuid);

create function public.rebuild_general_ledger_balances(p_business_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_date    date;
  v_created timestamptz;
  v_id      uuid;
begin
  select gl.entry_date, gl.created_at, gl.id
    into v_date, v_created, v_id
    from public.general_ledger gl
   where gl.business_id = p_business_id
   order by gl.entry_date, gl.created_at, gl.id
   limit 1;

  if v_id is null then
    return 0;
  end if;

  return public.recalculate_ledger_balances_from(p_business_id, v_date, v_created, v_id);
end;
$$;

comment on function public.rebuild_general_ledger_balances(uuid) is
  'Recomputes general_ledger.balance for one business from debit/credit in (entry_date, created_at, id) order, starting at 0. Touches only the balance column.';

-- Convenience: rebuild every business, each as its own book.
create function public.rebuild_general_ledger_balances()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer := 0;
  b record;
begin
  for b in select id from public.businesses order by id loop
    v_total := v_total + public.rebuild_general_ledger_balances(b.id);
  end loop;
  return v_total;
end;
$$;

create or replace function public.calculate_general_ledger_balance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_balance numeric(12,2);
begin
  select gl.balance
    into previous_balance
    from public.general_ledger gl
   where gl.business_id = new.business_id
     and (gl.entry_date, gl.created_at, gl.id)
         < (new.entry_date, new.created_at, new.id)
   order by gl.entry_date desc, gl.created_at desc, gl.id desc
   limit 1;

  previous_balance := coalesce(previous_balance, 0);

  if new.debit is not null then
    new.balance := previous_balance + new.debit;
  else
    new.balance := previous_balance - new.credit;
  end if;

  return new;
end;
$$;

-- Statement-level AFTER triggers: one anchor PER BUSINESS touched.

create or replace function public.recalc_ledger_balances_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  for r in
    select distinct on (i.business_id) i.business_id, i.entry_date, i.created_at, i.id
      from inserted i
     order by i.business_id, i.entry_date, i.created_at, i.id
  loop
    perform public.recalculate_ledger_balances_from(r.business_id, r.entry_date, r.created_at, r.id);
  end loop;
  return null;
end;
$$;

create or replace function public.recalc_ledger_balances_after_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  -- Anchor at the earlier of each moved row's old and new position, per
  -- business (business_id itself is immutable).
  for r in
    with moved as (
      select o.business_id,
             o.entry_date as o_date, o.created_at as o_created, o.id as o_id,
             n.entry_date as n_date, n.created_at as n_created, n.id as n_id
        from old_rows o
        join new_rows n on n.id = o.id
       where o.debit      is distinct from n.debit
          or o.credit     is distinct from n.credit
          or o.entry_date is distinct from n.entry_date
          or o.created_at is distinct from n.created_at
    ),
    anchors as (
      select business_id, o_date as entry_date, o_created as created_at, o_id as id from moved
      union all
      select business_id, n_date, n_created, n_id from moved
    )
    select distinct on (a.business_id) a.business_id, a.entry_date, a.created_at, a.id
      from anchors a
     order by a.business_id, a.entry_date, a.created_at, a.id
  loop
    perform public.recalculate_ledger_balances_from(r.business_id, r.entry_date, r.created_at, r.id);
  end loop;
  return null;
end;
$$;

create or replace function public.recalc_ledger_balances_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  -- The anchor rows are gone, so `>= anchor` selects exactly their successors.
  for r in
    select distinct on (o.business_id) o.business_id, o.entry_date, o.created_at, o.id
      from old_rows o
     order by o.business_id, o.entry_date, o.created_at, o.id
  loop
    perform public.recalculate_ledger_balances_from(r.business_id, r.entry_date, r.created_at, r.id);
  end loop;
  return null;
end;
$$;

drop trigger if exists trg_recalc_balances_after_insert on public.general_ledger;
drop trigger if exists trg_recalc_balances_after_update on public.general_ledger;
drop trigger if exists trg_recalc_balances_after_delete on public.general_ledger;

create trigger trg_recalc_balances_after_insert
  after insert on public.general_ledger
  referencing new table as inserted
  for each statement execute function public.recalc_ledger_balances_after_insert();

create trigger trg_recalc_balances_after_update
  after update on public.general_ledger
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.recalc_ledger_balances_after_update();

create trigger trg_recalc_balances_after_delete
  after delete on public.general_ledger
  referencing old table as old_rows
  for each statement execute function public.recalc_ledger_balances_after_delete();

-- The vendor sub-ledger copy carries the GL row's business.
create or replace function public.create_vendor_sub_ledger_entry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.vendor_id is null then
    return new;
  end if;

  insert into public.vendor_ledger (
    business_id, vendor_id, general_ledger_id, entry_date, particulars, debit, credit, balance, notes
  ) values (
    new.business_id,
    new.vendor_id,
    new.id,
    new.entry_date,
    new.particulars,
    new.credit,   -- general-ledger credit  -> vendor sub-ledger debit
    new.debit,    -- general-ledger debit   -> vendor sub-ledger credit
    0,            -- overwritten by trg_calculate_vendor_ledger_balance
    new.notes
  );

  return new;
end;
$$;

-- vendor_ledger balances are already partitioned by vendor_id, and a vendor
-- belongs to exactly one business (guard above), so they need no change.

-- ---------------------------------------------------------------------------
-- 6. MCP commit path (feature is OFF; kept fail-closed and scoped)
-- ---------------------------------------------------------------------------

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
  if not exists (select 1 from public.users u where u.id = p_user_id and u.role = 'admin') then
    insert into public.ledger_mcp_audit (user_id, action, outcome, proposal_id)
    values (p_user_id, 'commit', 'forbidden', p_proposal_id);
    return jsonb_build_object('status', 'forbidden');
  end if;

  select * into p
    from public.ledger_mcp_proposals
   where id = p_proposal_id and user_id = p_user_id
     for update;

  if not found then
    insert into public.ledger_mcp_audit (user_id, action, outcome, proposal_id)
    values (p_user_id, 'commit', 'not_found', p_proposal_id);
    return jsonb_build_object('status', 'not_found');
  end if;

  -- Membership is re-checked at commit, like the role.
  if not exists (
    select 1 from public.user_businesses ub
     where ub.user_id = p_user_id and ub.business_id = p.business_id
  ) then
    insert into public.ledger_mcp_audit (user_id, action, outcome, proposal_id, business_id)
    values (p_user_id, 'commit', 'forbidden', p.id, p.business_id);
    return jsonb_build_object('status', 'forbidden');
  end if;

  if p.status = 'committed' then
    insert into public.ledger_mcp_audit (user_id, action, outcome, proposal_id, ledger_entry_id, business_id)
    values (p_user_id, 'commit', 'already_committed', p.id, p.ledger_entry_id, p.business_id);
    return jsonb_build_object('status', 'already_committed', 'ledger_entry_id', p.ledger_entry_id);
  end if;

  if p.expires_at <= now() then
    insert into public.ledger_mcp_audit (user_id, action, outcome, proposal_id, business_id)
    values (p_user_id, 'commit', 'expired', p.id, p.business_id);
    return jsonb_build_object('status', 'expired');
  end if;

  insert into public.general_ledger
         (business_id, entry_date, particulars, debit, credit, entry_type, notes, vendor_id)
  values (p.business_id,
          (p.payload ->> 'entry_date')::date,
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

  insert into public.ledger_mcp_audit (user_id, action, outcome, proposal_id, ledger_entry_id, business_id)
  values (p_user_id, 'commit', 'committed', p.id, v_entry.id, p.business_id);

  return jsonb_build_object('status', 'committed', 'ledger_entry_id', v_entry.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Privileges
-- ---------------------------------------------------------------------------

revoke all on function public.general_ledger_lock_key(uuid) from public, anon, authenticated;
revoke all on function public.lock_general_ledger_business() from public, anon, authenticated;
revoke all on function public.recalculate_ledger_balances_from(uuid, date, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.rebuild_general_ledger_balances(uuid) from public, anon, authenticated;
revoke all on function public.rebuild_general_ledger_balances() from public, anon, authenticated;
revoke all on function public.calculate_general_ledger_balance() from public, anon, authenticated;
revoke all on function public.recalc_ledger_balances_after_insert() from public, anon, authenticated;
revoke all on function public.recalc_ledger_balances_after_update() from public, anon, authenticated;
revoke all on function public.recalc_ledger_balances_after_delete() from public, anon, authenticated;
revoke all on function public.create_vendor_sub_ledger_entry() from public, anon, authenticated;
revoke all on function public.commit_ledger_proposal(uuid, uuid) from public, anon, authenticated;
grant execute on function public.recalculate_ledger_balances_from(uuid, date, timestamptz, uuid) to service_role;
grant execute on function public.rebuild_general_ledger_balances(uuid) to service_role;
grant execute on function public.rebuild_general_ledger_balances() to service_role;
grant execute on function public.commit_ledger_proposal(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Memberships (access matrix: admin -> ATC + Techlink; staff -> ATC only)
-- ---------------------------------------------------------------------------

insert into public.user_businesses (user_id, business_id)
select u.id, b.id
  from public.users u
  join public.businesses b on b.slug = 'atc'
on conflict do nothing;

insert into public.user_businesses (user_id, business_id)
select u.id, b.id
  from public.users u
  join public.businesses b on b.slug = 'techlink'
 where u.role = 'admin'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 9. RLS: member of the row's business (defence in depth)
-- ---------------------------------------------------------------------------
--
-- The app reads and writes these tables only through API routes using the
-- service role (which bypasses RLS) and enforces membership there. These
-- policies close the direct-PostgREST path: a signed-in staff user with the
-- anon key previously could read any row ("auth.role() = 'authenticated'"),
-- which after this change would include Techlink's.

create or replace function public.current_user_business_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ub.business_id from public.user_businesses ub where ub.user_id = auth.uid()
$$;
revoke all on function public.current_user_business_ids() from public, anon;
grant execute on function public.current_user_business_ids() to authenticated, service_role;

alter table public.businesses enable row level security;
alter table public.user_businesses enable row level security;
revoke all on public.businesses, public.user_businesses from anon, authenticated;
grant select on public.businesses, public.user_businesses to authenticated;
grant all on public.businesses, public.user_businesses to service_role;

drop policy if exists businesses_member_read on public.businesses;
create policy businesses_member_read on public.businesses
  for select to authenticated
  using (id in (select public.current_user_business_ids()));

drop policy if exists user_businesses_own_read on public.user_businesses;
create policy user_businesses_own_read on public.user_businesses
  for select to authenticated
  using (user_id = auth.uid());

do $$
declare
  t   text;
  pol record;
begin
  foreach t in array array[
    'customers', 'measurements', 'vendors', 'orders', 'payments',
    'general_ledger', 'vendor_ledger', 'order_items', 'vendor_tags'
  ] loop
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
  end loop;

  foreach t in array array[
    'customers', 'measurements', 'vendors', 'orders', 'payments',
    'general_ledger', 'vendor_ledger'
  ] loop
    execute format(
      'create policy business_member_all on public.%I for all to authenticated
         using (business_id in (select public.current_user_business_ids()))
         with check (business_id in (select public.current_user_business_ids()))', t);
  end loop;
end;
$$;

create policy business_member_all on public.order_items for all to authenticated
  using (exists (select 1 from public.orders o
                  where o.id = order_items.order_id
                    and o.business_id in (select public.current_user_business_ids())))
  with check (exists (select 1 from public.orders o
                       where o.id = order_items.order_id
                         and o.business_id in (select public.current_user_business_ids())));

create policy business_member_all on public.vendor_tags for all to authenticated
  using (exists (select 1 from public.vendors v
                  where v.id = vendor_tags.vendor_id
                    and v.business_id in (select public.current_user_business_ids())))
  with check (exists (select 1 from public.vendors v
                       where v.id = vendor_tags.vendor_id
                         and v.business_id in (select public.current_user_business_ids())));

-- ---------------------------------------------------------------------------
-- 10. Rebuild per business and verify. Any failure aborts the migration.
-- ---------------------------------------------------------------------------

select public.rebuild_general_ledger_balances();

do $$
declare
  v_bad          integer;
  v_drift        integer;
  v_vl_drift     integer;
  v_unscoped     integer;
  v_was_ok       boolean := (select ok from _gl_before_consistent);
  v_techlink     uuid := (select id from public.businesses where slug = 'techlink');
  v_tl_rows      integer;
begin
  -- (a) Every stored balance equals the cumulative sum WITHIN its business.
  select count(*) into v_bad
    from (
      select gl.balance,
             sum(coalesce(gl.debit, 0) - coalesce(gl.credit, 0))
               over (partition by gl.business_id
                     order by gl.entry_date, gl.created_at, gl.id
                     rows between unbounded preceding and current row) as expected
        from public.general_ledger gl
    ) t
   where t.balance is distinct from t.expected;
  if v_bad > 0 then
    raise exception 'general_ledger per-business reconciliation failed: % rows disagree', v_bad;
  end if;

  -- (b) ATC holds every pre-existing row, so its per-business series must equal
  --     the pre-migration global series exactly -- when that series was itself
  --     consistent. If it was not (stale balances from before 20261101), the
  --     rebuild above corrected it; report how many rows moved.
  select count(*) into v_drift
    from _gl_before b
    join public.general_ledger gl on gl.id = b.id
   where gl.balance is distinct from b.balance;
  if v_was_ok and v_drift > 0 then
    raise exception 'ATC balances changed by the migration: % rows differ from the pre-migration series', v_drift;
  end if;
  raise notice 'general_ledger: % rows, pre-migration series consistent = %, rows corrected = %',
    (select count(*) from _gl_before), v_was_ok, v_drift;

  select count(*) into v_vl_drift
    from _vl_before b
    join public.vendor_ledger vl on vl.id = b.id
   where vl.balance is distinct from b.balance;
  if v_vl_drift > 0 then
    raise exception 'vendor_ledger balances changed by the migration: % rows', v_vl_drift;
  end if;

  -- (c) Nothing left unscoped, nothing in Techlink yet.
  select (select count(*) from public.customers      where business_id is null)
       + (select count(*) from public.measurements   where business_id is null)
       + (select count(*) from public.vendors        where business_id is null)
       + (select count(*) from public.orders         where business_id is null)
       + (select count(*) from public.payments       where business_id is null)
       + (select count(*) from public.general_ledger where business_id is null)
       + (select count(*) from public.vendor_ledger  where business_id is null)
    into v_unscoped;
  if v_unscoped > 0 then
    raise exception 'backfill incomplete: % rows without business_id', v_unscoped;
  end if;

  select (select count(*) from public.customers      where business_id = v_techlink)
       + (select count(*) from public.measurements   where business_id = v_techlink)
       + (select count(*) from public.vendors        where business_id = v_techlink)
       + (select count(*) from public.orders         where business_id = v_techlink)
       + (select count(*) from public.payments       where business_id = v_techlink)
       + (select count(*) from public.general_ledger where business_id = v_techlink)
       + (select count(*) from public.vendor_ledger  where business_id = v_techlink)
    into v_tl_rows;
  if v_tl_rows > 0 then
    raise exception 'Techlink should start empty, found % rows', v_tl_rows;
  end if;

  -- (d) Staff never get Techlink.
  if exists (
    select 1 from public.user_businesses ub
      join public.users u on u.id = ub.user_id
     where ub.business_id = v_techlink and u.role is distinct from 'admin'
  ) then
    raise exception 'a non-admin user was granted Techlink';
  end if;
end;
$$;
