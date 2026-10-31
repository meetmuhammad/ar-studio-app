-- ============================================================================
-- general_ledger running-balance integrity
-- ============================================================================
--
-- THE BUG
-- -------
-- `general_ledger.balance` is a stored running balance, and the UI shows it
-- as-is. Only a BEFORE INSERT row trigger computed it -- from the new row's
-- predecessor -- and nothing re-walked the rows after it. A back-dated insert
-- (an entry dated before rows that already exist) therefore got a correct
-- balance itself while every later row kept a balance that never included it.
--
-- The UPDATE path had the same hole for date-only edits: it recalculated only
-- when debit/credit changed. The ordering key (entry_date, created_at) is not
-- unique -- imported rows share a created_at -- so tied rows could be assigned
-- balances in a different order from the one the ledger displays.
--
-- THE FIX
-- -------
-- * One recalculation function, recalculate_ledger_balances_from(), walks the
--   ledger in the total order (entry_date, created_at, id) from an anchor row.
-- * Statement-level AFTER INSERT / UPDATE / DELETE triggers call it from the
--   earliest affected position. UPDATE fires on amount, entry_date and
--   created_at changes.
-- * Concurrency: a BEFORE statement trigger takes a transaction-scoped advisory
--   lock, so ledger writers run one at a time. It runs before the statement
--   locks any row, so writers cannot deadlock on each other's balance updates,
--   and each recalculation sees every previously committed write.
-- * Recursion: the recalculation's own balance UPDATE re-fires the UPDATE
--   trigger; a transaction-local flag (ar.ledger_recalc) makes that a no-op.
-- * The old row-level functions are dropped. recalculate_balances_after_date()
--   was also callable by anon over /rest/v1/rpc.
--
-- RECONCILIATION
-- --------------
-- Existing balances are rebuilt from debit/credit alone, starting at 0. Opening
-- balances are ordinary `opening_balance` rows with a debit or credit, so they
-- are included by the same sum. Only the balance column is written. The
-- migration then checks every row against an independent cumulative sum and
-- aborts (rolling back everything) on any mismatch.
-- ============================================================================

set local lock_timeout = '5s';

-- Block ledger writes for the whole migration, so nothing can land between the
-- schema change, the rebuild and the verification below.
lock table public.general_ledger in share row exclusive mode;

-- ---------------------------------------------------------------------------
-- 0. Total, indexable ordering key.
-- ---------------------------------------------------------------------------

-- A NULL created_at would make the row comparisons below neither < nor >=.
-- This fails (and rolls back) rather than inventing timestamps if one exists.
alter table public.general_ledger alter column created_at set not null;

create index if not exists idx_general_ledger_chrono
  on public.general_ledger (entry_date, created_at, id);

-- ---------------------------------------------------------------------------
-- 1. Remove the old row-level recalculation.
-- ---------------------------------------------------------------------------

drop trigger if exists trg_recalc_balance_after_update on public.general_ledger;
drop trigger if exists trg_recalc_balance_after_delete on public.general_ledger;
drop function if exists public.recalc_balance_after_update();
drop function if exists public.recalc_balance_after_delete();
drop function if exists public.recalculate_balances_after_date(timestamptz, timestamptz);

-- ---------------------------------------------------------------------------
-- 2. Writer serialisation.
-- ---------------------------------------------------------------------------

create or replace function public.lock_general_ledger_writes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Re-entrant within a transaction, released at COMMIT/ROLLBACK.
  perform pg_advisory_xact_lock(hashtext('public.general_ledger.balance'));
  return null;
end;
$$;

drop trigger if exists trg_lock_general_ledger_writes on public.general_ledger;
create trigger trg_lock_general_ledger_writes
  before insert or update or delete on public.general_ledger
  for each statement execute function public.lock_general_ledger_writes();

-- ---------------------------------------------------------------------------
-- 3. The single source of truth for the running balance.
-- ---------------------------------------------------------------------------

create or replace function public.recalculate_ledger_balances_from(
  p_entry_date date,
  p_created_at timestamptz,
  p_id         uuid
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
  if coalesce(current_setting('ar.ledger_recalc', true), 'off') = 'on' then
    return 0;
  end if;
  perform pg_advisory_xact_lock(hashtext('public.general_ledger.balance'));
  perform set_config('ar.ledger_recalc', 'on', true);

  select gl.balance
    into v_previous
    from public.general_ledger gl
   where (gl.entry_date, gl.created_at, gl.id) < (p_entry_date, p_created_at, p_id)
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
     where (gl.entry_date, gl.created_at, gl.id) >= (p_entry_date, p_created_at, p_id)
  ),
  applied as (
    update public.general_ledger gl
       set balance = ordered.new_balance
      from ordered
     where gl.id = ordered.id
       and gl.balance is distinct from ordered.new_balance
    returning 1
  )
  select count(*) into v_changed from applied;

  perform set_config('ar.ledger_recalc', 'off', true);
  return v_changed;
end;
$$;

comment on function public.recalculate_ledger_balances_from(date, timestamptz, uuid) is
  'Rewrites general_ledger.balance for every row at or after the (entry_date, created_at, id) anchor. Returns rows changed. Touches only the balance column.';

create or replace function public.rebuild_general_ledger_balances()
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
   order by gl.entry_date, gl.created_at, gl.id
   limit 1;

  if v_id is null then
    return 0;
  end if;

  return public.recalculate_ledger_balances_from(v_date, v_created, v_id);
end;
$$;

comment on function public.rebuild_general_ledger_balances() is
  'Recomputes every general_ledger.balance from debit/credit in (entry_date, created_at, id) order. Touches only the balance column.';

-- ---------------------------------------------------------------------------
-- 4. BEFORE INSERT: correct balance on the first pass for a plain append.
-- ---------------------------------------------------------------------------

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
   where (gl.entry_date, gl.created_at, gl.id)
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

-- ---------------------------------------------------------------------------
-- 5. Statement-level AFTER triggers.
-- ---------------------------------------------------------------------------

create or replace function public.recalc_ledger_balances_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_date    date;
  v_created timestamptz;
  v_id      uuid;
begin
  select i.entry_date, i.created_at, i.id
    into v_date, v_created, v_id
    from inserted i
   order by i.entry_date, i.created_at, i.id
   limit 1;

  if v_id is null then
    return null;
  end if;

  perform public.recalculate_ledger_balances_from(v_date, v_created, v_id);
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
  v_date    date;
  v_created timestamptz;
  v_id      uuid;
begin
  -- Anchor at the earlier of each moved row's old and new position.
  with moved as (
    select o.entry_date as o_date, o.created_at as o_created, o.id as o_id,
           n.entry_date as n_date, n.created_at as n_created, n.id as n_id
      from old_rows o
      join new_rows n on n.id = o.id
     where o.debit      is distinct from n.debit
        or o.credit     is distinct from n.credit
        or o.entry_date is distinct from n.entry_date
        or o.created_at is distinct from n.created_at
  ),
  anchors as (
    select o_date as entry_date, o_created as created_at, o_id as id from moved
    union all
    select n_date, n_created, n_id from moved
  )
  select a.entry_date, a.created_at, a.id
    into v_date, v_created, v_id
    from anchors a
   order by a.entry_date, a.created_at, a.id
   limit 1;

  if v_id is null then
    return null;
  end if;

  perform public.recalculate_ledger_balances_from(v_date, v_created, v_id);
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
  v_date    date;
  v_created timestamptz;
  v_id      uuid;
begin
  select o.entry_date, o.created_at, o.id
    into v_date, v_created, v_id
    from old_rows o
   order by o.entry_date, o.created_at, o.id
   limit 1;

  if v_id is null then
    return null;
  end if;

  -- The anchor row is gone, so `>= anchor` selects exactly its successors.
  perform public.recalculate_ledger_balances_from(v_date, v_created, v_id);
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

-- ---------------------------------------------------------------------------
-- 6. Privileges: none of these are callable over PostgREST.
-- ---------------------------------------------------------------------------

revoke all on function public.lock_general_ledger_writes() from public, anon, authenticated;
revoke all on function public.recalculate_ledger_balances_from(date, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.rebuild_general_ledger_balances() from public, anon, authenticated;
revoke all on function public.calculate_general_ledger_balance() from public, anon, authenticated;
revoke all on function public.recalc_ledger_balances_after_insert() from public, anon, authenticated;
revoke all on function public.recalc_ledger_balances_after_update() from public, anon, authenticated;
revoke all on function public.recalc_ledger_balances_after_delete() from public, anon, authenticated;
grant execute on function public.recalculate_ledger_balances_from(date, timestamptz, uuid) to service_role;
grant execute on function public.rebuild_general_ledger_balances() to service_role;

-- ---------------------------------------------------------------------------
-- 7. Reconcile existing balances, then verify independently.
-- ---------------------------------------------------------------------------

select public.rebuild_general_ledger_balances();

do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad
    from (
      select gl.balance,
             sum(coalesce(gl.debit, 0) - coalesce(gl.credit, 0))
               over (order by gl.entry_date, gl.created_at, gl.id
                     rows between unbounded preceding and current row) as expected
        from public.general_ledger gl
    ) t
   where t.balance is distinct from t.expected;

  if v_bad > 0 then
    raise exception 'general_ledger reconciliation failed: % rows disagree with the cumulative sum', v_bad;
  end if;
end;
$$;
