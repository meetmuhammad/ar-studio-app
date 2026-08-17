-- ============================================================================
-- vendor_ledger running-balance integrity  (per-vendor chains)
-- ============================================================================
--
-- THE BUG
-- -------
-- `vendor_ledger.balance` is a *stored* running balance, one independent chain
-- per `vendor_id`. Nothing maintained it.
--
--   * The only writer was `create_vendor_sub_ledger_entry()`, an AFTER INSERT
--     FOR EACH ROW trigger on `general_ledger`. It read the predecessor with
--
--         order by entry_date desc, created_at desc limit 1
--
--     which is NOT a total order -- two rows can tie on both columns -- and,
--     worse, it is a *last row wins* lookup rather than a *predecessor of this
--     row* lookup. It copies `NEW.entry_date` from the general_ledger row, so a
--     back-dated general_ledger entry produces a back-dated vendor_ledger entry
--     whose balance is computed from the newest row instead of from the row it
--     actually follows, and every later row for that vendor keeps a balance
--     that no longer follows from its predecessor.
--
--   * `POST /api/vendor-ledger` (src/app/api/vendor-ledger/route.ts) computes
--     the balance in JavaScript with the same non-total `entry_date desc,
--     created_at desc, limit 1` query and inserts it directly.
--
--   * There was NO trigger of any kind on `vendor_ledger` -- no AFTER INSERT
--     recalculation, no repair on UPDATE, no repair on DELETE. The table was
--     clean only because the seed happened to insert in chronological order.
--
-- This is the same defect class fixed for `general_ledger` in
-- 20260817140000_ledger_balance_integrity.sql, with one structural difference
-- that changes every query: vendor_ledger is PARTITIONED BY VENDOR. Each vendor
-- owns a separate chain starting at zero. A single global running total would
-- be wrong. Every window here therefore carries `partition by vendor_id`, and
-- every anchor lookup carries `where vendor_id = ...`.
--
-- THE FIX
-- -------
-- The canonical order is `(entry_date, created_at, id)` WITHIN a vendor -- the
-- same triple general_ledger uses, and the same order the API returns rows in.
-- `id` is the primary key, so the triple is unique and the order is total.
--
-- Four things are added:
--   1. `created_at` forced NOT NULL (a NULL member makes the row-wise
--      comparisons below evaluate to NULL, i.e. neither before nor after) and
--      an index on `(vendor_id, entry_date, created_at, id)`.
--   2. `recalculate_vendor_ledger_balances_from(vendor, date, created, id)` --
--      the single definition of vendor-ledger order.
--   3. `calculate_vendor_ledger_balance()` BEFORE INSERT, so the ordinary
--      append writes the right value on the first pass.
--   4. STATEMENT-level AFTER INSERT / UPDATE / DELETE triggers with transition
--      tables, which recalculate each affected vendor from that vendor's own
--      minimum affected position.
--
-- `create_vendor_sub_ledger_entry()` is rewritten to stop computing a balance
-- at all. Leaving its arithmetic in place would leave a second, wrong
-- definition of vendor-ledger order in the database.
--
-- WHY STATEMENT LEVEL
-- -------------------
-- A row-level repair re-walks the vendor's tail once per affected row, so a
-- bulk import is quadratic. One statement now costs one tail walk per affected
-- vendor.
--
-- RECURSION
-- ---------
-- The recalculation UPDATEs `vendor_ledger`, which fires the AFTER UPDATE
-- trigger, which would recalculate again. Both recalculation functions take a
-- transaction-local re-entrancy flag (`ar.vendor_ledger_recalc`) and return
-- immediately if it is already held, so the depth is at most two and the
-- second level does no work. A transaction-local flag is used in preference to
-- `pg_trigger_depth()` because depth would also suppress a *legitimate*
-- vendor_ledger insert made from inside some unrelated trigger -- which is
-- exactly what `create_vendor_sub_ledger_entry()` is.
--
-- The flag is deliberately NOT the `ar.ledger_recalc` flag used by the
-- general_ledger migration. They must stay separate: `create_vendor_sub_ledger_
-- entry()` runs inside a general_ledger statement, and if the two tables shared
-- one flag a vendor_ledger write occurring inside a general_ledger
-- recalculation window would be silently skipped.
--
-- PRIVILEGES
-- ----------
-- Every function here lives in `public`, so PostgREST would otherwise expose
-- the non-trigger ones at /rest/v1/rpc/<name> to anyone holding the
-- browser-embedded anon key, bypassing the withAuth/withAdmin route guards.
-- EXECUTE is revoked from public/anon/authenticated and granted to
-- service_role only. SECURITY DEFINER so a write performed by `authenticated`
-- still recalculates over all of that vendor's rows rather than the
-- RLS-visible subset, and so the trigger functions can call the helper after
-- EXECUTE has been revoked from their invoking role.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Make the ordering key total and indexable.
-- ---------------------------------------------------------------------------

update public.vendor_ledger set created_at = now() where created_at is null;
alter table public.vendor_ledger alter column created_at set not null;
alter table public.vendor_ledger alter column created_at set default now();

-- vendor_id leads: every scan below is scoped to one vendor first and ordered
-- second, so this index serves both the anchor lookup and the window scan.
create index if not exists idx_vendor_ledger_chrono
  on public.vendor_ledger (vendor_id, entry_date, created_at, id);

-- ---------------------------------------------------------------------------
-- 1. The single source of truth for one vendor's running balance.
-- ---------------------------------------------------------------------------

create or replace function public.recalculate_vendor_ledger_balances_from(
  p_vendor_id  uuid,
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
  if p_vendor_id is null or p_id is null then
    return 0;
  end if;

  -- Re-entrancy guard. `true` scopes the setting to the current transaction, so
  -- it is released by COMMIT or ROLLBACK and can never leak between requests on
  -- a pooled connection.
  if coalesce(current_setting('ar.vendor_ledger_recalc', true), 'off') = 'on' then
    return 0;
  end if;
  perform set_config('ar.vendor_ledger_recalc', 'on', true);

  -- Balance carried in from the last row of THIS VENDOR strictly BEFORE the
  -- anchor position. The row-wise comparison (a,b,c) < (x,y,z) is exactly the
  -- lexicographic order that `order by a, b, c` produces. `p_entry_date` is
  -- declared `date`, matching the column type, so no timezone-dependent
  -- implicit cast is possible.
  select vl.balance
    into v_previous
    from public.vendor_ledger vl
   where vl.vendor_id = p_vendor_id
     and (vl.entry_date, vl.created_at, vl.id) < (p_entry_date, p_created_at, p_id)
   order by vl.entry_date desc, vl.created_at desc, vl.id desc
   limit 1;

  -- No predecessor means this is the vendor's first entry: the chain starts at
  -- zero, independently of every other vendor.
  v_previous := coalesce(v_previous, 0);

  with ordered as (
    select vl.id,
           v_previous
             + sum(coalesce(vl.debit, 0) - coalesce(vl.credit, 0))
               over (partition by vl.vendor_id
                     order by vl.entry_date, vl.created_at, vl.id
                     rows between unbounded preceding and current row)
             as new_balance
      from public.vendor_ledger vl
     where vl.vendor_id = p_vendor_id
       and (vl.entry_date, vl.created_at, vl.id) >= (p_entry_date, p_created_at, p_id)
  ),
  applied as (
    update public.vendor_ledger vl
       set balance = ordered.new_balance
      from ordered
     -- Skipping no-op writes keeps an append-only insert from dirtying the
     -- whole tail, and keeps the AFTER UPDATE trigger from firing at all in the
     -- common case.
     where vl.id = ordered.id
       and vl.balance is distinct from ordered.new_balance
    returning 1
  )
  select count(*) into v_changed from applied;

  perform set_config('ar.vendor_ledger_recalc', 'off', true);
  return v_changed;
end;
$$;

comment on function public.recalculate_vendor_ledger_balances_from(uuid, date, timestamptz, uuid) is
  'Rewrites vendor_ledger.balance for every row of ONE vendor at or after the given (entry_date, created_at, id) anchor. Returns the number of rows whose balance actually changed. Never inserts or deletes.';

-- Recompute every vendor's chain from scratch. Used by the migration backfill
-- and available for operator repair; deliberately NOT exposed as an HTTP route.
-- It only rewrites the `balance` column from the debit/credit already stored --
-- it never deletes or recreates ledger rows.
--
-- Unlike its general_ledger counterpart this does not delegate to the anchored
-- function once per vendor (which would be one tail walk per vendor). A single
-- `partition by vendor_id` window rebuilds every chain in one pass, each
-- starting from zero.
create or replace function public.rebuild_vendor_ledger_balances()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_changed integer := 0;
begin
  if coalesce(current_setting('ar.vendor_ledger_recalc', true), 'off') = 'on' then
    return 0;
  end if;
  perform set_config('ar.vendor_ledger_recalc', 'on', true);

  with ordered as (
    select vl.id,
           sum(coalesce(vl.debit, 0) - coalesce(vl.credit, 0))
             over (partition by vl.vendor_id
                   order by vl.entry_date, vl.created_at, vl.id
                   rows between unbounded preceding and current row)
           as new_balance
      from public.vendor_ledger vl
  ),
  applied as (
    update public.vendor_ledger vl
       set balance = ordered.new_balance
      from ordered
     where vl.id = ordered.id
       and vl.balance is distinct from ordered.new_balance
    returning 1
  )
  select count(*) into v_changed from applied;

  perform set_config('ar.vendor_ledger_recalc', 'off', true);
  return v_changed;
end;
$$;

comment on function public.rebuild_vendor_ledger_balances() is
  'Recomputes every vendor_ledger.balance from scratch, one chain per vendor_id, in (entry_date, created_at, id) order. Non-destructive: touches only the balance column.';

-- ---------------------------------------------------------------------------
-- 2. BEFORE INSERT: give the new row a correct balance immediately.
-- ---------------------------------------------------------------------------
--
-- Kept alongside the statement-level trigger so the ordinary append case writes
-- the right value on the first pass and the statement-level pass finds nothing
-- to change. It also makes `balance` genuinely derived: whatever a caller
-- supplies is overwritten, which is what closes the JS-computed balance in
-- POST /api/vendor-ledger.

create or replace function public.calculate_vendor_ledger_balance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_balance numeric(12,2);
begin
  select vl.balance
    into previous_balance
    from public.vendor_ledger vl
   where vl.vendor_id = new.vendor_id
     and (vl.entry_date, vl.created_at, vl.id)
         < (new.entry_date, new.created_at, new.id)
   order by vl.entry_date desc, vl.created_at desc, vl.id desc
   limit 1;

  new.balance := coalesce(previous_balance, 0)
                 + coalesce(new.debit, 0)
                 - coalesce(new.credit, 0);

  return new;
end;
$$;

drop trigger if exists trg_calculate_vendor_ledger_balance on public.vendor_ledger;
create trigger trg_calculate_vendor_ledger_balance
  before insert on public.vendor_ledger
  for each row
  execute function public.calculate_vendor_ledger_balance();

-- ---------------------------------------------------------------------------
-- 3. Statement-level AFTER triggers -- the actual fix.
-- ---------------------------------------------------------------------------
--
-- Each walks the transition table, picks the MINIMUM affected position PER
-- VENDOR, and recalculates that vendor from there. A statement touching several
-- vendors repairs each of them from its own anchor; no vendor's chain is ever
-- computed from another vendor's rows.

create or replace function public.recalc_vendor_ledger_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  for r in
    select distinct on (i.vendor_id)
           i.vendor_id, i.entry_date, i.created_at, i.id
      from inserted i
     where i.vendor_id is not null
     order by i.vendor_id, i.entry_date, i.created_at, i.id
  loop
    perform public.recalculate_vendor_ledger_balances_from(
      r.vendor_id, r.entry_date, r.created_at, r.id);
  end loop;
  return null;
end;
$$;

create or replace function public.recalc_vendor_ledger_after_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  -- Only a change to an amount, to a row's *position*, or to the vendor that
  -- owns it can invalidate a chain. A balance-only write (which is what the
  -- recalculation itself performs) matches nothing here, and the re-entrancy
  -- flag catches the rest.
  --
  -- A row that changes vendor_id invalidates BOTH chains, so the old and new
  -- vendor each contribute an anchor.
  for r in
    with moved as (
      select o.vendor_id as o_vendor, o.entry_date as o_date,
             o.created_at as o_created, o.id as o_id,
             n.vendor_id as n_vendor, n.entry_date as n_date,
             n.created_at as n_created, n.id as n_id
        from old_rows o
        join new_rows n on n.id = o.id
       where o.debit      is distinct from n.debit
          or o.credit     is distinct from n.credit
          or o.entry_date is distinct from n.entry_date
          or o.created_at is distinct from n.created_at
          or o.vendor_id  is distinct from n.vendor_id
    ),
    anchors as (
      select o_vendor as vendor_id, o_date as entry_date,
             o_created as created_at, o_id as id
        from moved
      union all
      select n_vendor, n_date, n_created, n_id from moved
    )
    select distinct on (a.vendor_id)
           a.vendor_id, a.entry_date, a.created_at, a.id
      from anchors a
     where a.vendor_id is not null
     order by a.vendor_id, a.entry_date, a.created_at, a.id
  loop
    perform public.recalculate_vendor_ledger_balances_from(
      r.vendor_id, r.entry_date, r.created_at, r.id);
  end loop;
  return null;
end;
$$;

create or replace function public.recalc_vendor_ledger_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  -- The anchor rows are gone, so `>= anchor` selects exactly their successors
  -- within each vendor. This is what keeps the chain whole when a general_ledger
  -- row is removed and the ON DELETE CASCADE on
  -- vendor_ledger.general_ledger_id takes the sub-ledger row with it.
  for r in
    select distinct on (o.vendor_id)
           o.vendor_id, o.entry_date, o.created_at, o.id
      from old_rows o
     where o.vendor_id is not null
     order by o.vendor_id, o.entry_date, o.created_at, o.id
  loop
    perform public.recalculate_vendor_ledger_balances_from(
      r.vendor_id, r.entry_date, r.created_at, r.id);
  end loop;
  return null;
end;
$$;

drop trigger if exists trg_recalc_vendor_ledger_after_insert on public.vendor_ledger;
drop trigger if exists trg_recalc_vendor_ledger_after_update on public.vendor_ledger;
drop trigger if exists trg_recalc_vendor_ledger_after_delete on public.vendor_ledger;

create trigger trg_recalc_vendor_ledger_after_insert
  after insert on public.vendor_ledger
  referencing new table as inserted
  for each statement
  execute function public.recalc_vendor_ledger_after_insert();

create trigger trg_recalc_vendor_ledger_after_update
  after update on public.vendor_ledger
  referencing old table as old_rows new table as new_rows
  for each statement
  execute function public.recalc_vendor_ledger_after_update();

create trigger trg_recalc_vendor_ledger_after_delete
  after delete on public.vendor_ledger
  referencing old table as old_rows
  for each statement
  execute function public.recalc_vendor_ledger_after_delete();

-- ---------------------------------------------------------------------------
-- 4. Stop the general_ledger trigger from computing a vendor balance.
-- ---------------------------------------------------------------------------
--
-- `create_vendor_sub_ledger_entry()` keeps its real job -- mirroring a
-- general_ledger row into the vendor sub-ledger with the sign inverted (a
-- credit in the general ledger is money we owe the vendor, so a debit in their
-- sub-ledger) -- but no longer computes `balance`. The BEFORE INSERT trigger
-- above does that, from the correct position, so the non-total
-- `order by entry_date desc, created_at desc limit 1` lookup disappears from
-- the database entirely. The literal 0 below is a placeholder that satisfies
-- the NOT NULL column and is overwritten before the row is stored.
--
-- The two near-identical INSERT branches are collapsed into one; the behaviour
-- for a row with neither debit nor credit changes from writing NULL into a NOT
-- NULL column (an error) to writing a zero-movement entry.

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
    vendor_id, general_ledger_id, entry_date, particulars, debit, credit, balance, notes
  ) values (
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

-- ---------------------------------------------------------------------------
-- 5. Privileges.
-- ---------------------------------------------------------------------------
--
-- A public-schema function is reachable at /rest/v1/rpc/<name> with the anon
-- key that ships in the browser bundle. Trigger functions are not exposed by
-- PostgREST (they return `trigger`), but they are revoked too so the rule holds
-- uniformly and a future refactor cannot promote one by accident. EXECUTE on a
-- trigger function is checked at CREATE TRIGGER time, not when it fires, so the
-- triggers above keep working for every role.

revoke all on function public.recalculate_vendor_ledger_balances_from(uuid, date, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.rebuild_vendor_ledger_balances()                                       from public, anon, authenticated;
revoke all on function public.calculate_vendor_ledger_balance()                                      from public, anon, authenticated;
revoke all on function public.recalc_vendor_ledger_after_insert()                                    from public, anon, authenticated;
revoke all on function public.recalc_vendor_ledger_after_update()                                    from public, anon, authenticated;
revoke all on function public.recalc_vendor_ledger_after_delete()                                    from public, anon, authenticated;
revoke all on function public.create_vendor_sub_ledger_entry()                                       from public, anon, authenticated;

grant execute on function public.recalculate_vendor_ledger_balances_from(uuid, date, timestamptz, uuid) to service_role;
grant execute on function public.rebuild_vendor_ledger_balances()                                       to service_role;

-- ---------------------------------------------------------------------------
-- 6. Backfill.
-- ---------------------------------------------------------------------------
--
-- Every balance written before this migration was computed under the broken
-- rules, so the whole column is rebuilt once, per vendor. Idempotent:
-- re-running changes nothing once every chain is whole.

select public.rebuild_vendor_ledger_balances();

-- ---------------------------------------------------------------------------
-- 7. Assert every vendor's chain is whole, and fail the migration if not.
-- ---------------------------------------------------------------------------
--
-- Two separate checks. `broken_links` catches any adjacent pair inside a
-- vendor's chain that does not step by debit - credit. `bad_first_rows` catches
-- the row a lag() check cannot see: the first entry of each vendor, whose
-- balance must equal its own movement because each chain starts at zero.

do $$
declare
  v_broken integer;
  v_first  integer;
begin
  with ord as (
    select vl.balance,
           coalesce(vl.debit, 0) - coalesce(vl.credit, 0) as delta,
           lag(vl.balance) over w as prev,
           row_number() over w as rn
      from public.vendor_ledger vl
    window w as (partition by vl.vendor_id
                 order by vl.entry_date, vl.created_at, vl.id)
  )
  select count(*) filter (where prev is not null and balance - prev - delta <> 0),
         count(*) filter (where rn = 1 and balance <> delta)
    into v_broken, v_first
    from ord;

  if v_broken > 0 or v_first > 0 then
    raise exception
      'vendor_ledger balance chain still broken after backfill: % bad links, % bad first rows',
      v_broken, v_first;
  end if;
end;
$$;
