-- record_payment / update_payment accept exactly the payment methods the
-- payments table allows.
--
-- WHY
-- ---
-- The payments table's CHECK allows payment_method in
-- ('cash', 'bank', 'card', 'online', 'other'); orders allows only
-- ('cash', 'bank', 'other'). record_payment and update_payment
-- (20261119000100, last replaced in 20261119000500) checked the orders list,
-- so since POST /api/payments and PATCH /api/payments/[id] call them, a mobile
-- client sending 'card' or 'online' got 400 where the old direct insert or
-- update succeeded.
--
-- WHAT
-- ----
--   1. public.payment_method_is_valid(text): internal, immutable, the one copy
--      of the payments list in the functions. Case-sensitive, like the CHECK.
--   2. record_payment and update_payment: identical to 20261119000500 except
--      that the method is checked with payment_method_is_valid. Signatures,
--      return shapes, errors (22023 'Invalid payment method: ...'), grants,
--      SECURITY DEFINER and search_path are unchanged.
--
-- NOT CHANGED
-- -----------
-- create_order / update_order keep ('cash', 'bank', 'other'): that is what the
-- orders table allows for advance_payment_method. delete_payment does not look
-- at the method.
--
-- Idempotent (CREATE OR REPLACE). One transaction.

begin;

-- ---------------------------------------------------------------- helper
-- Internal: not executable by clients. Keep in step with the payments CHECK.
create or replace function public.payment_method_is_valid(p_method text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(p_method in ('cash', 'bank', 'card', 'online', 'other'), false)
$$;

comment on function public.payment_method_is_valid(text) is
  'True when p_method is a payment method the payments table allows (cash, bank, card, online, other; case-sensitive). Used by record_payment and update_payment (20261119000700).';

-- ---------------------------------------------------------------- record_payment
-- As 20261119000500; the method is checked with payment_method_is_valid.
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
  if not public.payment_method_is_valid(v_method) then
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
-- As 20261119000500; the method is checked with payment_method_is_valid. As
-- before, the ledger row is found by payment_id (legacy fallback in
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
    if not public.payment_method_is_valid(v_text) then
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

-- ---------------------------------------------------------------- privileges
-- CREATE OR REPLACE keeps existing grants; repeated here so the file stands alone.
revoke all on function public.payment_method_is_valid(text) from public, anon, authenticated;

revoke all on function public.record_payment(uuid, jsonb) from public, anon;
revoke all on function public.update_payment(uuid, jsonb) from public, anon;
grant execute on function public.record_payment(uuid, jsonb) to authenticated;
grant execute on function public.update_payment(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------- checks
do $$
declare
  f text;
  m text;
begin
  foreach m in array array['cash', 'bank', 'card', 'online', 'other'] loop
    if not public.payment_method_is_valid(m) then
      raise exception 'payment_method_is_valid rejects %', m;
    end if;
  end loop;
  foreach m in array array['Cash', 'cheque', '', 'card '] loop
    if public.payment_method_is_valid(m) then
      raise exception 'payment_method_is_valid accepts %', quote_literal(m);
    end if;
  end loop;
  if public.payment_method_is_valid(null) then
    raise exception 'payment_method_is_valid accepts null';
  end if;

  foreach f in array array[
    'public.record_payment(uuid, jsonb)',
    'public.update_payment(uuid, jsonb)'
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

  if has_function_privilege('authenticated', 'public.payment_method_is_valid(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.payment_method_is_valid(text)', 'EXECUTE') then
    raise exception 'internal helper payment_method_is_valid is executable by a client role';
  end if;

  raise notice 'payment functions accept the payments table''s methods';
end;
$$;

commit;
