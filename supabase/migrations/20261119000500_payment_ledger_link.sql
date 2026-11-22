-- Link each payment to its general_ledger row (general_ledger.payment_id).
--
-- WHY
-- ---
-- A payment produces exactly one general_ledger row (entry_type order_payment,
-- particulars "Payment for Order #<n>", debit = amount, order_id). Until now
-- nothing recorded WHICH row: update_payment / delete_payment found it again by
-- a heuristic (order, particulars, amount, date, preferring matching notes;
-- order_payment_find_ledger_row in 20261119000100). That breaks on two equal
-- payments on the same day, on a hand-edited row, and on any write path that
-- does not go through the functions: DELETE /api/payments/[id] (service role)
-- deleted the payment and left its ledger row behind.
--
-- WHAT
-- ----
--   1. general_ledger.payment_id uuid references payments(id) ON DELETE CASCADE,
--      a partial UNIQUE index (one ledger row per payment), and a CHECK that
--      only order_payment rows carry a payment_id.
--   2. Backfill: each existing payment is linked to at most one existing,
--      unlinked "Payment for Order #<n>" row by the old heuristic, one-to-one
--      and deterministically (see section 2). No ledger row is created,
--      changed (other than payment_id) or deleted. Unmatched payments and rows
--      are only REPORTED (NOTICEs below, and
--      scripts/sql/payment_ledger_mismatches.sql for the per-order detail).
--   3. record_payment sets payment_id. update_payment / delete_payment find the
--      row by payment_id; only for a legacy payment (no linked row) they fall
--      back to the heuristic, restricted to UNLINKED rows, and link what they
--      find. delete_payment deletes the ledger row and the payment in the same
--      transaction, explicitly (the cascade is the safety net).
--      Signatures, return shapes, grants and the admin/member checks are
--      unchanged. create_order / update_order / delete_order are not touched.
--
-- ON DELETE CASCADE AND THE RUNNING BALANCE
-- ----------------------------------------
-- A referential action is executed by Postgres as an ordinary
-- `DELETE FROM ONLY general_ledger WHERE payment_id = $1`, run as the table
-- owner. Every general_ledger trigger therefore fires exactly as for a direct
-- delete:
--   - trg_0b_lock_general_ledger_business_del (BEFORE ROW): the per-business
--     advisory lock (20261106000000);
--   - trg_recalc_balances_after_delete (AFTER STATEMENT, transition table
--     old_rows): recalculates that business's balances from the deleted row's
--     position (20261101000000 / 20261106000000).
-- So a `delete from payments` from anywhere (service-role API, an admin via
-- RLS, the SQL editor) removes the payment's ledger row and re-walks the
-- balances; nothing is bypassed. delete_order still deletes the order's
-- order_payment rows before its payments, so the cascade finds nothing left
-- there. supabase/tests/order_payment_functions_check.sql checks both paths.
--
-- NOT CHANGED
-- -----------
-- Advance rows ("Advance payment for Order #<n>") have no payments row and are
-- never linked. Rows written before this migration that no payment matches
-- keep payment_id null and behave exactly as before.
--
-- Idempotent (IF NOT EXISTS, guarded constraint adds, CREATE OR REPLACE, the
-- backfill only touches unlinked rows). One transaction.

begin;

set local lock_timeout = '5s';

-- No payment or ledger write may land between the backfill and the function
-- swap. ADD COLUMN needs ACCESS EXCLUSIVE on general_ledger anyway, and the
-- foreign key needs SHARE ROW EXCLUSIVE on payments. This migration is short.
lock table public.general_ledger in access exclusive mode;
lock table public.payments in share row exclusive mode;

-- ---------------------------------------------------------------- 1. schema

alter table public.general_ledger add column if not exists payment_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'general_ledger_payment_id_fkey'
                    and conrelid = 'public.general_ledger'::regclass) then
    alter table public.general_ledger
      add constraint general_ledger_payment_id_fkey
      foreign key (payment_id) references public.payments (id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint
                  where conname = 'general_ledger_payment_id_order_payment_chk'
                    and conrelid = 'public.general_ledger'::regclass) then
    alter table public.general_ledger
      add constraint general_ledger_payment_id_order_payment_chk
      check (payment_id is null or entry_type = 'order_payment');
  end if;
end;
$$;

-- One ledger row per payment. Also serves the cascade's `payment_id = $1`.
create unique index if not exists general_ledger_payment_id_key
  on public.general_ledger (payment_id)
  where payment_id is not null;

comment on column public.general_ledger.payment_id is
  'The payment this order_payment row records (set by record_payment; legacy rows linked by 20261119000500). Deleting the payment deletes this row (ON DELETE CASCADE). Null for advances and every other entry type.';

-- ---------------------------------------------------------------- 2. backfill
--
-- A payment P and a row L match when they share business, order, amount and
-- date, and L.particulars = 'Payment for Order #' || the order's number (so an
-- advance row can never match). Within a group of equal keys both sides are
-- numbered by (created_at, id) and paired by that number, so N equal payments
-- on one day take N distinct rows, oldest with oldest. Pass 1 also requires
-- the notes the row was written with (payment notes, or "Payment via
-- <method>"); pass 2 pairs what is left without the notes. Already linked
-- payments and rows are skipped, so a re-run changes nothing.

do $$
declare
  v_pass    int;
  v_linked  int;
  v_total   int := 0;
  v_pay_un  int;
  v_row_un  int;
  v_pay_all int;
begin
  for v_pass in 1..2 loop
    with pay as (
      select p.id as payment_id,
             p.business_id,
             p.order_id,
             'Payment for Order #' || o.order_number as particulars,
             p.amount,
             p.payment_date,
             case when v_pass = 1
                  then coalesce(nullif(p.notes, ''), 'Payment via ' || p.payment_method) end as notes_key,
             row_number() over (
               partition by p.business_id, p.order_id, p.amount, p.payment_date,
                            case when v_pass = 1
                                 then coalesce(nullif(p.notes, ''), 'Payment via ' || p.payment_method) end
               order by p.created_at, p.id) as rn
        from public.payments p
        join public.orders o on o.id = p.order_id
       where not exists (select 1 from public.general_ledger x where x.payment_id = p.id)
    ),
    led as (
      select gl.id as ledger_id,
             gl.business_id,
             gl.order_id,
             gl.particulars,
             gl.debit,
             gl.entry_date,
             case when v_pass = 1 then gl.notes end as notes_key,
             row_number() over (
               partition by gl.business_id, gl.order_id, gl.particulars, gl.debit, gl.entry_date,
                            case when v_pass = 1 then gl.notes end
               order by gl.created_at, gl.id) as rn
        from public.general_ledger gl
       where gl.entry_type = 'order_payment'
         and gl.payment_id is null
         and gl.order_id is not null
         and gl.particulars like 'Payment for Order #%'
    ),
    pairs as (
      select pay.payment_id, led.ledger_id
        from pay
        join led
          on led.business_id = pay.business_id
         and led.order_id    = pay.order_id
         and led.particulars = pay.particulars
         and led.debit       = pay.amount
         and led.entry_date  = pay.payment_date
         and led.notes_key is not distinct from pay.notes_key
         and led.rn          = pay.rn
    )
    update public.general_ledger gl
       set payment_id = pairs.payment_id
      from pairs
     where gl.id = pairs.ledger_id;

    get diagnostics v_linked = row_count;
    v_total := v_total + v_linked;
    raise notice 'payment_ledger_link backfill pass %: % rows linked', v_pass, v_linked;
  end loop;

  select count(*) into v_pay_all from public.payments;
  select count(*) into v_pay_un
    from public.payments p
   where not exists (select 1 from public.general_ledger gl where gl.payment_id = p.id);
  select count(*) into v_row_un
    from public.general_ledger gl
   where gl.entry_type = 'order_payment'
     and gl.payment_id is null
     and gl.particulars like 'Payment for Order #%';

  -- Report only: nothing is created or deleted for these.
  raise notice 'payment_ledger_link: % payments, % linked now, % without a ledger row, % "Payment for Order" rows without a payment',
    v_pay_all, v_total, v_pay_un, v_row_un;
  if v_pay_un > 0 or v_row_un > 0 then
    raise notice 'payment_ledger_link: run scripts/sql/payment_ledger_mismatches.sql for the per-order detail';
  end if;
end;
$$;

-- ---------------------------------------------------------------- 3. helpers
-- Internal: not executable by clients.

-- The legacy heuristic, now restricted to rows not linked to any payment, so
-- it can never take another payment's row. Same signature as 20261119000100.
create or replace function public.order_payment_find_ledger_row(
  p_business_id uuid, p_order_id uuid, p_order_number text,
  p_amount numeric, p_date date, p_notes text
)
returns uuid
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  select gl.id
    from public.general_ledger gl
   where gl.business_id = p_business_id
     and gl.order_id = p_order_id
     and gl.entry_type = 'order_payment'
     and gl.payment_id is null
     and gl.particulars = 'Payment for Order #' || p_order_number
     and gl.debit = p_amount
     and gl.entry_date = p_date
   order by (gl.notes is not distinct from p_notes) desc, gl.created_at, gl.id
   limit 1
   for update
$$;

-- The ledger row of a payment (its state BEFORE the caller changes it): the
-- linked row; for a legacy payment without one, the heuristic match, which is
-- then linked. Null when neither exists. Locks the row.
create or replace function public.order_payment_ledger_row_for(
  p_payment      public.payments,
  p_order_number text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  select gl.id into v_id
    from public.general_ledger gl
   where gl.payment_id = p_payment.id
     for update;
  if v_id is not null then
    return v_id;
  end if;

  v_id := public.order_payment_find_ledger_row(
    p_payment.business_id, p_payment.order_id, p_order_number, p_payment.amount, p_payment.payment_date,
    coalesce(nullif(p_payment.notes, ''), 'Payment via ' || p_payment.payment_method));
  if v_id is not null then
    update public.general_ledger set payment_id = p_payment.id where id = v_id;
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- record_payment
-- As 20261119000100, plus payment_id on the ledger row.
create or replace function public.record_payment(p_order_id uuid, p_payment jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_order   public.orders%rowtype;
  v_amount  numeric;
  v_method  text;
  v_date    date;
  v_notes   text;
  v_row     public.payments%rowtype;
  v_payment public.payments%rowtype;
begin
  perform public.order_payment_caller_role(true);
  if p_payment is null or jsonb_typeof(p_payment) <> 'object' then
    raise exception 'Missing required fields: order_id, customer_id, amount' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found
     or not public.order_payment_is_member(v_order.business_id)
     or (coalesce(p_payment ->> 'customer_id', '') <> ''
         and (p_payment ->> 'customer_id')::uuid is distinct from v_order.customer_id) then
    raise exception 'Order not found or does not belong to customer' using errcode = 'P0002';
  end if;

  v_amount := public.order_payment_num(p_payment -> 'amount');
  if v_amount is null or v_amount = 0 then
    raise exception 'Missing required fields: order_id, customer_id, amount' using errcode = '22023';
  end if;
  if v_amount < 0 then
    raise exception 'Amount must be positive' using errcode = '22023';
  end if;
  v_method := coalesce(nullif(p_payment ->> 'payment_method', ''), 'other');
  if v_method not in ('cash', 'bank', 'other') then
    raise exception 'Invalid payment method: %', v_method using errcode = '22023';
  end if;
  v_date  := coalesce(nullif(p_payment ->> 'payment_date', '')::date, (now() at time zone 'utc')::date);
  v_notes := nullif(p_payment ->> 'notes', '');
  if length(coalesce(v_notes, '')) > 500 then
    raise exception 'Notes too long' using errcode = '22023';
  end if;

  v_row := jsonb_populate_record(null::public.payments, jsonb_build_object(
    'business_id',    v_order.business_id,
    'order_id',       v_order.id,
    'customer_id',    v_order.customer_id,
    'amount',         v_amount,
    'payment_method', v_method,
    'payment_date',   v_date,
    'notes',          v_notes
  ));
  insert into public.payments (business_id, order_id, customer_id, amount, payment_method, payment_date, notes)
  values (v_row.business_id, v_row.order_id, v_row.customer_id, v_row.amount, v_row.payment_method,
          v_row.payment_date, v_row.notes)
  returning * into v_payment;

  insert into public.general_ledger (business_id, entry_date, particulars, debit, entry_type, order_id, notes, payment_id)
  values (v_order.business_id, v_date, 'Payment for Order #' || v_order.order_number, v_amount,
          'order_payment', v_order.id, coalesce(v_notes, 'Payment via ' || v_method), v_payment.id);

  return to_jsonb(v_payment);
end;
$$;

-- ---------------------------------------------------------------- update_payment
-- As 20261119000100; the ledger row is found by payment_id (legacy fallback in
-- order_payment_ledger_row_for), and a newly written row is linked.
create or replace function public.update_payment(p_payment_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_old    public.payments%rowtype;
  v_new    public.payments%rowtype;
  v_order  public.orders%rowtype;
  v_set    jsonb := '{}'::jsonb;
  v_patch  jsonb := coalesce(p_patch, '{}'::jsonb);
  v_num    numeric;
  v_text   text;
  v_ledger uuid;
begin
  perform public.order_payment_caller_role(true);
  if jsonb_typeof(v_patch) <> 'object' then
    raise exception 'Payment changes must be an object' using errcode = '22023';
  end if;

  select * into v_old from public.payments where id = p_payment_id for update;
  if not found or not public.order_payment_is_member(v_old.business_id) then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  select * into v_order from public.orders where id = v_old.order_id;

  -- Only payments fields; never the order's (as the API).
  if v_patch ? 'amount' then
    v_num := public.order_payment_num(v_patch -> 'amount');
    if v_num is null or v_num <= 0 then
      raise exception 'Amount must be positive' using errcode = '22023';
    end if;
    v_set := v_set || jsonb_build_object('amount', v_num);
  end if;
  if v_patch ? 'payment_method' then
    v_text := v_patch ->> 'payment_method';
    if v_text is null or v_text not in ('cash', 'bank', 'other') then
      raise exception 'Invalid payment method: %', coalesce(v_text, '(none)') using errcode = '22023';
    end if;
    v_set := v_set || jsonb_build_object('payment_method', v_text);
  end if;
  if coalesce(v_patch ->> 'payment_date', '') <> '' then
    v_set := v_set || jsonb_build_object('payment_date', (v_patch ->> 'payment_date')::date);
  end if;
  if v_patch ? 'notes' then
    if length(coalesce(v_patch ->> 'notes', '')) > 500 then
      raise exception 'Notes too long' using errcode = '22023';
    end if;
    v_set := v_set || jsonb_build_object('notes', v_patch -> 'notes');
  end if;

  -- Find (and lock) the ledger row from the payment's state before the change;
  -- the legacy heuristic needs the old amount, date and notes.
  v_ledger := public.order_payment_ledger_row_for(v_old, v_order.order_number);

  v_new := jsonb_populate_record(v_old, v_set);
  update public.payments
     set amount = v_new.amount, payment_method = v_new.payment_method,
         payment_date = v_new.payment_date, notes = v_new.notes
   where id = p_payment_id
  returning * into v_new;

  -- The payment's ledger row follows it.
  if v_ledger is not null then
    update public.general_ledger
       set debit = v_new.amount,
           entry_date = v_new.payment_date,
           notes = coalesce(nullif(v_new.notes, ''), 'Payment via ' || v_new.payment_method),
           updated_at = now()
     where id = v_ledger;
  else
    insert into public.general_ledger (business_id, entry_date, particulars, debit, entry_type, order_id, notes, payment_id)
    values (v_new.business_id, v_new.payment_date, 'Payment for Order #' || v_order.order_number, v_new.amount,
            'order_payment', v_new.order_id, coalesce(nullif(v_new.notes, ''), 'Payment via ' || v_new.payment_method),
            v_new.id);
  end if;

  return to_jsonb(v_new);
end;
$$;

-- ---------------------------------------------------------------- delete_payment
-- As 20261119000100; the ledger row is found by payment_id (legacy fallback in
-- order_payment_ledger_row_for). Both rows go in this transaction.
create or replace function public.delete_payment(p_payment_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_old    public.payments%rowtype;
  v_order  public.orders%rowtype;
  v_ledger uuid;
begin
  perform public.order_payment_caller_role(true);
  select * into v_old from public.payments where id = p_payment_id for update;
  if not found or not public.order_payment_is_member(v_old.business_id) then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  select * into v_order from public.orders where id = v_old.order_id;

  -- Explicit, so the intent is visible here; deleting the payment below would
  -- also remove a linked row through general_ledger_payment_id_fkey (cascade).
  v_ledger := public.order_payment_ledger_row_for(v_old, v_order.order_number);
  if v_ledger is not null then
    delete from public.general_ledger where id = v_ledger;
  end if;

  delete from public.payments where id = p_payment_id;
  return jsonb_build_object('id', p_payment_id, 'deleted', true);
end;
$$;

-- ---------------------------------------------------------------- privileges
-- CREATE OR REPLACE keeps existing grants; repeated here so the file stands alone.
revoke all on function public.order_payment_find_ledger_row(uuid, uuid, text, numeric, date, text) from public, anon, authenticated;
revoke all on function public.order_payment_ledger_row_for(public.payments, text) from public, anon, authenticated;

revoke all on function public.record_payment(uuid, jsonb) from public, anon;
revoke all on function public.update_payment(uuid, jsonb) from public, anon;
revoke all on function public.delete_payment(uuid) from public, anon;
grant execute on function public.record_payment(uuid, jsonb) to authenticated;
grant execute on function public.update_payment(uuid, jsonb) to authenticated;
grant execute on function public.delete_payment(uuid) to authenticated;

-- ---------------------------------------------------------------- checks
do $$
declare
  f     text;
  v_bad int;
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'general_ledger_payment_id_fkey'
                    and conrelid = 'public.general_ledger'::regclass
                    and confrelid = 'public.payments'::regclass
                    and confdeltype = 'c') then
    raise exception 'general_ledger.payment_id is not an ON DELETE CASCADE foreign key to payments';
  end if;
  if not exists (select 1 from pg_indexes
                  where schemaname = 'public' and indexname = 'general_ledger_payment_id_key') then
    raise exception 'unique index general_ledger_payment_id_key is missing';
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'general_ledger_payment_id_order_payment_chk'
                    and conrelid = 'public.general_ledger'::regclass
                    and convalidated) then
    raise exception 'check general_ledger_payment_id_order_payment_chk is missing or not validated';
  end if;

  -- Every link agrees with its payment (true by construction; checked anyway).
  select count(*) into v_bad
    from public.general_ledger gl
    join public.payments p on p.id = gl.payment_id
   where gl.order_id is distinct from p.order_id
      or gl.business_id is distinct from p.business_id
      or gl.particulars not like 'Payment for Order #%';
  if v_bad > 0 then
    raise exception '% ledger rows are linked to a payment of another order or business', v_bad;
  end if;

  foreach f in array array[
    'public.record_payment(uuid, jsonb)',
    'public.update_payment(uuid, jsonb)',
    'public.delete_payment(uuid)'
  ] loop
    if not has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception '% is not executable by authenticated', f;
    end if;
    if has_function_privilege('anon', f, 'EXECUTE') then
      raise exception '% is executable by anon', f;
    end if;
    if not (select p.prosecdef from pg_proc p where p.oid = f::regprocedure) then
      raise exception '% is not SECURITY DEFINER', f;
    end if;
  end loop;

  foreach f in array array[
    'public.order_payment_find_ledger_row(uuid, uuid, text, numeric, date, text)',
    'public.order_payment_ledger_row_for(public.payments, text)'
  ] loop
    if has_function_privilege('authenticated', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE') then
      raise exception 'internal helper % is executable by a client role', f;
    end if;
  end loop;

  raise notice 'payment ledger link installed';
end;
$$;

commit;
