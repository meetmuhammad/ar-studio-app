-- ============================================================================
-- general_ledger running-balance integrity
-- ============================================================================
--
-- THE BUG
-- -------
-- `general_ledger.balance` is a *stored* running balance. Three triggers were
-- supposed to keep it true:
--
--   trg_calculate_general_ledger_balance  BEFORE INSERT  -> calculate_general_ledger_balance()
--   trg_recalc_balance_after_update       AFTER  UPDATE  -> recalc_balance_after_update()
--   trg_recalc_balance_after_delete       AFTER  DELETE  -> recalc_balance_after_delete()
--
-- The BEFORE INSERT trigger reads the *predecessor's* balance and sets the new
-- row's balance from it -- and then stops. Nothing was wired to AFTER INSERT.
-- So an entry saved with a back-dated `entry_date` (the UI lets the user pick
-- any date) computes a correct balance for itself and leaves every later row
-- holding a balance that no longer follows from its predecessor. There was no
-- self-heal: only UPDATE and DELETE repaired the tail.
--
-- Second, subtler defect: `recalculate_balances_after_date()` ordered by
-- (entry_date, created_at). That is not a total order -- two rows can tie on
-- both -- so tied rows could be assigned balances in an order that disagrees
-- with the order the ledger table and the CSV export display them in. The API
-- layer sorts by (entry_date, created_at, id); the database must match exactly.
--
-- Third: the AFTER UPDATE trigger only fired when `debit`/`credit` changed.
-- Moving a row by editing `entry_date` re-orders the ledger and was silently
-- ignored.
--
-- THE FIX
-- -------
-- `recalculate_balances_after_date()` is REPLACED (not reused) by
-- `recalculate_ledger_balances_from(date, timestamptz, uuid)`. The old
-- signature took the anchor as two timestamptz values and compared a `date`
-- column against a `timestamptz` parameter (an implicit, timezone-dependent
-- cast), and its ordering was not total. Both are load-bearing defects in a
-- function whose whole job is deterministic ordering, so the old one is dropped
-- rather than patched, leaving exactly one definition of ledger order.
--
-- All three DML paths now converge on that one function, via STATEMENT-level
-- triggers with transition tables. Statement level matters: the previous
-- row-level design re-walked the whole tail once per affected row, so a bulk
-- import was quadratic. One statement now costs one tail walk.
--
-- RECURSION
-- ---------
-- The recalculation UPDATEs `general_ledger`, which fires the AFTER UPDATE
-- trigger, which would recalculate again. `recalculate_ledger_balances_from`
-- therefore takes a transaction-local re-entrancy flag (`ar.ledger_recalc`) and
-- returns immediately if it is already held. A transaction-local flag is used
-- in preference to `pg_trigger_depth()` because depth would also suppress a
-- *legitimate* ledger insert made from inside some unrelated trigger; the flag
-- suppresses only re-entry caused by this function's own writes. Recalculation
-- therefore runs at most once per outermost statement, and terminates.
--
-- PRIVILEGES
-- ----------
-- Every function here lives in `public`, so PostgREST would otherwise expose
-- the non-trigger ones at /rest/v1/rpc/<name> to anyone holding the
-- browser-embedded anon key -- bypassing the withAuth/withAdmin route guards
-- entirely. EXECUTE is revoked from public/anon/authenticated and granted to
-- service_role only, matching the discipline used for dashboard_stats.
--
-- The functions are SECURITY DEFINER so that a write performed by the
-- `authenticated` role still recalculates over *all* ledger rows rather than
-- the RLS-visible subset, and so the trigger functions can call the helper
-- after EXECUTE has been revoked from their invoking role.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Make the ordering key total and indexable.
-- ---------------------------------------------------------------------------

-- (entry_date, created_at, id) is the ledger's canonical order. `id` is the
-- primary key, so the triple is unique; `created_at` must be NOT NULL for the
-- row-wise comparisons below to behave (a NULL member makes a row comparison
-- return NULL, i.e. neither before nor after).
update public.general_ledger set created_at = now() where created_at is null;
alter table public.general_ledger alter column created_at set not null;
alter table public.general_ledger alter column created_at set default now();

create index if not exists idx_general_ledger_chrono
  on public.general_ledger (entry_date, created_at, id);

-- ---------------------------------------------------------------------------
-- 1. The single source of truth for the running balance.
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
  -- Re-entrancy guard. `true` scopes the setting to the current transaction, so
  -- it is released by COMMIT or ROLLBACK and can never leak between requests on
  -- a pooled connection.
  if coalesce(current_setting('ar.ledger_recalc', true), 'off') = 'on' then
    return 0;
  end if;
  perform set_config('ar.ledger_recalc', 'on', true);

  -- Balance carried in from the last row strictly BEFORE the anchor position.
  -- The row-wise comparison (a,b,c) < (x,y,z) is exactly the lexicographic
  -- order that `order by a, b, c` produces.
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
     -- Skipping no-op writes keeps an append-only insert from dirtying the
     -- whole tail, and keeps the AFTER UPDATE trigger from firing at all in the
     -- common case.
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
  'Rewrites general_ledger.balance for every row at or after the given (entry_date, created_at, id) anchor. Returns the number of rows whose balance actually changed. Never inserts or deletes.';

-- Recompute the entire ledger. Used by the migration backfill and available for
-- operator repair; deliberately NOT exposed as an HTTP route. It only rewrites
-- the `balance` column from the debit/credit already stored -- it never deletes
-- or recreates ledger rows.
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
  'Recomputes every general_ledger.balance from scratch in (entry_date, created_at, id) order. Non-destructive: touches only the balance column.';

-- ---------------------------------------------------------------------------
-- 2. BEFORE INSERT: give the new row a correct balance immediately.
-- ---------------------------------------------------------------------------
--
-- Kept (rather than deleted in favour of the statement-level trigger) so that
-- the ordinary append case writes the right value on the first pass and the
-- statement-level pass finds nothing to change. Its predecessor lookup now uses
-- the full (entry_date, created_at, id) key.

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
-- 3. Statement-level AFTER triggers -- the actual fix.
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
  -- The earliest row this statement inserted is the anchor: everything at or
  -- after it may now be stale. For a plain append this resolves to the last row
  -- in the table and the recalculation changes nothing.
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
  -- Only a change to an amount or to a row's *position* can invalidate the
  -- chain. A balance-only write (which is what this function's own
  -- recalculation performs) matches nothing here, and the re-entrancy flag in
  -- recalculate_ledger_balances_from catches the rest.
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

-- Replace the row-level triggers (quadratic on bulk DML, and blind to
-- back-dated inserts) with statement-level ones.
drop trigger if exists trg_recalc_balance_after_update  on public.general_ledger;
drop trigger if exists trg_recalc_balance_after_delete  on public.general_ledger;
drop trigger if exists trg_recalc_balances_after_insert on public.general_ledger;
drop trigger if exists trg_recalc_balances_after_update on public.general_ledger;
drop trigger if exists trg_recalc_balances_after_delete on public.general_ledger;

create trigger trg_recalc_balances_after_insert
  after insert on public.general_ledger
  referencing new table as inserted
  for each statement
  execute function public.recalc_ledger_balances_after_insert();

create trigger trg_recalc_balances_after_update
  after update on public.general_ledger
  referencing old table as old_rows new table as new_rows
  for each statement
  execute function public.recalc_ledger_balances_after_update();

create trigger trg_recalc_balances_after_delete
  after delete on public.general_ledger
  referencing old table as old_rows
  for each statement
  execute function public.recalc_ledger_balances_after_delete();

-- The old helper and the old row-level trigger functions are now unreferenced.
-- Dropping them removes the non-total ordering from the database entirely, so
-- there is no second, wrong definition of "ledger order" left to be called by
-- accident.
drop function if exists public.recalc_balance_after_update();
drop function if exists public.recalc_balance_after_delete();
drop function if exists public.recalculate_balances_after_date(timestamptz, timestamptz);

-- ---------------------------------------------------------------------------
-- 4. Privileges.
-- ---------------------------------------------------------------------------
--
-- A public-schema function is reachable at /rest/v1/rpc/<name> with the anon
-- key that ships in the browser bundle. Trigger functions are not exposed by
-- PostgREST (they return `trigger`), but they are revoked too so the rule holds
-- uniformly and a future refactor cannot promote one by accident. EXECUTE on a
-- trigger function is checked at CREATE TRIGGER time, not when it fires, so the
-- triggers above keep working for every role.

revoke all on function public.recalculate_ledger_balances_from(date, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.rebuild_general_ledger_balances()                          from public, anon, authenticated;
revoke all on function public.calculate_general_ledger_balance()                         from public, anon, authenticated;
revoke all on function public.recalc_ledger_balances_after_insert()                      from public, anon, authenticated;
revoke all on function public.recalc_ledger_balances_after_update()                      from public, anon, authenticated;
revoke all on function public.recalc_ledger_balances_after_delete()                      from public, anon, authenticated;

grant execute on function public.recalculate_ledger_balances_from(date, timestamptz, uuid) to service_role;
grant execute on function public.rebuild_general_ledger_balances()                          to service_role;

-- ---------------------------------------------------------------------------
-- 5. Backfill.
-- ---------------------------------------------------------------------------
--
-- Every balance written before this migration was computed under the broken
-- rules, so the whole column is rebuilt once. Idempotent: re-running changes
-- nothing once the chain is whole.

select public.rebuild_general_ledger_balances();

-- ---------------------------------------------------------------------------
-- 6. Assert the chain is whole, and fail the migration if it is not.
-- ---------------------------------------------------------------------------

do $$
declare
  v_broken integer;
begin
  select count(*)
    into v_broken
    from (
      select gl.balance
             - lag(gl.balance) over w
             - (coalesce(gl.debit, 0) - coalesce(gl.credit, 0)) as delta,
             lag(gl.balance) over w as prev
        from public.general_ledger gl
      window w as (order by gl.entry_date, gl.created_at, gl.id)
    ) t
   where t.prev is not null
     and t.delta <> 0;

  if v_broken > 0 then
    raise exception
      'general_ledger balance chain still broken after backfill: % bad links', v_broken;
  end if;
end;
$$;
