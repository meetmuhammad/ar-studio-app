-- Atomic order and payment writes for the browser (Refine) client.
--
-- WHY
-- ---
-- Creating an order writes several rows (the order, its items, and the
-- advance in general_ledger); recording a payment writes the payment and its
-- ledger row. general_ledger has no client grants by design
-- (20261024000000_close_role_escalation_and_ledger_direct_access.sql), so the
-- browser cannot do these writes itself, and doing them as separate requests
-- could leave half an order behind. These SECURITY DEFINER functions do each
-- operation in one transaction, with the same checks the API applies, and are
-- callable by `authenticated` only.
--
-- Every ledger write goes through the existing general_ledger triggers: the
-- per-business running balance (20261101000000 + 20261106000000) and the
-- business guard (enforce_business_scope). Nothing here touches balances
-- directly, and no table, trigger or existing function is changed.
--
-- WHAT EACH FUNCTION MIRRORS
-- --------------------------
--   create_order    POST /api/orders (src/app/api/orders/route.ts) with
--                   createOrder / nextOrderNumber / createOrderItems in
--                   src/lib/database.ts and CreateOrderSchema in
--                   src/lib/validators.ts. Same fields and `x || null`
--                   storage, same number format (<code>-#####, "AR" when the
--                   business has no code, continuing the latest order by
--                   created_at), same advance ledger row (particulars
--                   "Advance payment for Order #<n>", debit, entry_type
--                   order_payment, notes "Initial advance payment during order
--                   creation", entry_date = booking date). Like the API it
--                   creates no payments row for the advance.
--   update_order    PATCH /api/orders/[id] (updateOrder / updateOrderItems).
--   delete_order    DELETE /api/orders/[id] (deleteOrder).
--   record_payment  POST /api/payments (payment + ledger row "Payment for
--                   Order #<n>", notes = payment notes or "Payment via
--                   <method>").
--   update_payment  PATCH /api/payments/[id].
--   delete_payment  DELETE /api/payments/[id].
--
-- ROLES (same as the RLS policies of 20261119000000_role_scoped_rls.sql)
-- ---------------------------------------------------------------------
--   create_order, update_order          admin or staff, member of the business
--   delete_order                        admin, member of the business
--   record/update/delete_payment        admin, member of the business
-- The role is public.users.role; membership is an active user_businesses row
-- (the same rule as getMemberships in src/lib/business-context.ts).
--
-- DELIBERATE DIFFERENCES FROM THE API
-- -----------------------------------
--   1. Atomic: if any write fails nothing is kept. (POST /api/payments keeps
--      the payment when its ledger insert fails; POST /api/orders keeps the
--      order when an item or ledger insert fails.)
--   2. Ledger kept in step. The API's PATCH order, PATCH/DELETE payment and
--      DELETE order never touch general_ledger, so the books drift until
--      POST /api/general-ledger/sync-payments rebuilds them. These functions
--      apply the same rows sync-payments would produce, as they go:
--        - update_order: the advance row follows advance_paid and the booking
--          date (inserted, updated or removed);
--        - update_payment / delete_payment: the payment's ledger row is
--          updated or removed (matched by order, particulars, old amount and
--          old date, preferring the one with the old notes);
--        - delete_order: the order's order_payment ledger rows and payments go
--          with it (sync-payments would not recreate them for a deleted order).
--   3. Roles: deleting orders and writing payments is admin-only here (and in
--      RLS); the API still allows staff.
--   4. update_order only changes the keys present in p_patch. (The API's PATCH
--      sets total_amount, advance_paid, balance, payment_method and
--      measurement_id to null when they are absent from the body.)
--   5. create_order stores balance = total - advance (never below 0) when the
--      caller sends no balance; the API stores null in that case. The app
--      always sends it.
--
-- The API routes (service role), the mobile app and the MCP server are not
-- affected: they do not call these functions, and nothing they use changes.
--
-- Errors are raised with an SQLSTATE the client can map:
--   42501 not signed in / no role / not a member / admin only
--   P0002 not found (order, payment, customer or measurement of another business)
--   22023 invalid input       23514 inconsistent input (e.g. dates, advance > total)
--
-- Idempotent (CREATE OR REPLACE; grants repeatable). One transaction.

begin;

-- ---------------------------------------------------------------- helpers
-- Internal: not executable by clients; called only from the functions below.

create or replace function public.order_payment_caller_role(p_admin_only boolean)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'Unauthorized - Please sign in' using errcode = '42501';
  end if;
  select u.role into v_role from public.users u where u.id = v_uid;
  if v_role is null or v_role not in ('admin', 'staff') then
    raise exception 'Unauthorized - No role' using errcode = '42501';
  end if;
  if p_admin_only and v_role <> 'admin' then
    raise exception 'Forbidden - Only an admin can do this' using errcode = '42501';
  end if;
  return v_role;
end;
$$;

create or replace function public.order_payment_is_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.user_businesses ub
      join public.businesses b on b.id = ub.business_id
     where ub.user_id = auth.uid()
       and ub.business_id = p_business_id
       and b.is_active
  )
$$;

-- CreateOrderSchema's item rules: at most 4, known types, each type once,
-- description 1..1000 characters.
create or replace function public.order_payment_check_items(p_items jsonb)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_item  jsonb;
  v_type  text;
  v_desc  text;
  v_seen  text[] := '{}';
begin
  if p_items is null or jsonb_typeof(p_items) = 'null' then
    return;
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Order items must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 4 then
    raise exception 'Maximum 4 order items allowed' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_type := v_item ->> 'order_type';
    v_desc := v_item ->> 'description';
    if v_type is null or v_type not in ('nikkah', 'mehndi', 'barat', 'wallima', 'other') then
      raise exception 'Invalid order type: %', coalesce(v_type, '(none)') using errcode = '22023';
    end if;
    if v_desc is null or length(v_desc) < 1 then
      raise exception 'Description is required' using errcode = '22023';
    end if;
    if length(v_desc) > 1000 then
      raise exception 'Description too long' using errcode = '22023';
    end if;
    if v_type = any (v_seen) then
      raise exception 'Each order type can only be used once' using errcode = '22023';
    end if;
    v_seen := v_seen || v_type;
  end loop;
end;
$$;

-- A JSON number as numeric, or null for null / "" / absent.
create or replace function public.order_payment_num(p_value jsonb)
returns numeric
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' or p_value = '""'::jsonb then
    return null;
  end if;
  if jsonb_typeof(p_value) = 'number' then
    return (p_value #>> '{}')::numeric;
  end if;
  return (p_value #>> '{}')::numeric; -- numeric strings, as parseFloat accepts
exception when invalid_text_representation then
  raise exception 'Invalid amount: %', p_value #>> '{}' using errcode = '22023';
end;
$$;

-- The general_ledger row a payment produced (see record_payment), for update
-- and delete. Matches order, particulars, amount and date; prefers the row
-- whose notes match. Locks it.
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
     and gl.particulars = 'Payment for Order #' || p_order_number
     and gl.debit = p_amount
     and gl.entry_date = p_date
   order by (gl.notes is not distinct from p_notes) desc, gl.created_at, gl.id
   limit 1
   for update
$$;

-- The advance row create_order (and the API) wrote for an order. Locks it.
create or replace function public.order_payment_find_advance_row(p_order_id uuid, p_order_number text)
returns uuid
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  select gl.id
    from public.general_ledger gl
   where gl.order_id = p_order_id
     and gl.entry_type = 'order_payment'
     and gl.particulars = 'Advance payment for Order #' || p_order_number
   order by gl.created_at, gl.id
   limit 1
   for update
$$;

-- ---------------------------------------------------------------- create_order
create or replace function public.create_order(
  p_business_id uuid,
  p_order       jsonb,
  p_items       jsonb default null,
  p_advance     jsonb default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_business public.businesses%rowtype;
  v_customer uuid;
  v_measure  uuid;
  v_booking  date;
  v_delivery date;
  v_status   text;
  v_total    numeric;
  v_advance  numeric;
  v_balance  numeric;
  v_method   text;
  v_prefix   text;
  v_last     text;
  v_next     bigint;
  v_number   text;
  v_attempt  int := 0;
  v_row      public.orders%rowtype;
  v_order    public.orders%rowtype;
begin
  perform public.order_payment_caller_role(false);
  if p_business_id is null or not public.order_payment_is_member(p_business_id) then
    raise exception 'Forbidden - No access to this business' using errcode = '42501';
  end if;
  select * into v_business from public.businesses where id = p_business_id;

  if p_order is null or jsonb_typeof(p_order) <> 'object' then
    raise exception 'Order details are required' using errcode = '22023';
  end if;

  -- CreateOrderSchema field rules.
  if coalesce(p_order ->> 'customer_id', '') = '' then
    raise exception 'Please select a customer' using errcode = '22023';
  end if;
  v_customer := (p_order ->> 'customer_id')::uuid;
  v_measure  := nullif(p_order ->> 'measurement_id', '')::uuid;
  if coalesce(p_order ->> 'booking_date', '') = '' then
    raise exception 'Booking date is required' using errcode = '22023';
  end if;
  if coalesce(p_order ->> 'delivery_date', '') = '' then
    raise exception 'Delivery date is required' using errcode = '22023';
  end if;
  v_booking  := (p_order ->> 'booking_date')::date;
  v_delivery := (p_order ->> 'delivery_date')::date;
  if v_delivery < v_booking then
    raise exception 'Delivery date must be on or after booking date' using errcode = '23514';
  end if;
  v_status := coalesce(nullif(p_order ->> 'status', ''), 'In Process');
  if v_status not in ('In Process', 'Delivered', 'Cancelled') then
    raise exception 'Invalid order status: %', v_status using errcode = '22023';
  end if;
  if length(coalesce(p_order ->> 'comments', '')) > 1000 then
    raise exception 'Comments too long' using errcode = '22023';
  end if;
  if length(coalesce(p_order ->> 'fitting_preferences', '')) > 1000 then
    raise exception 'Fitting preferences too long' using errcode = '22023';
  end if;

  v_total   := coalesce(public.order_payment_num(p_order -> 'total_amount'), 0);
  v_advance := coalesce(public.order_payment_num(p_advance -> 'amount'),
                        public.order_payment_num(p_order -> 'advance_paid'), 0);
  if v_total < 0 then
    raise exception 'Total amount must be positive' using errcode = '22023';
  end if;
  if v_advance < 0 then
    raise exception 'Advance paid cannot be negative' using errcode = '22023';
  end if;
  if v_total <> 0 and v_advance <> 0 and v_advance > v_total then
    raise exception 'Advance paid cannot exceed total amount' using errcode = '23514';
  end if;
  v_balance := case
    when p_order ? 'balance' then coalesce(public.order_payment_num(p_order -> 'balance'), 0)
    else greatest(v_total - v_advance, 0)
  end;
  if v_balance < 0 then
    raise exception 'Balance cannot be negative' using errcode = '22023';
  end if;
  v_method := coalesce(nullif(p_advance ->> 'payment_method', ''), nullif(p_order ->> 'payment_method', ''));
  if v_method is not null and v_method not in ('cash', 'bank', 'other') then
    raise exception 'Invalid payment method: %', v_method using errcode = '22023';
  end if;

  perform public.order_payment_check_items(p_items);

  -- The customer and measurement must be in this business (404 in the API).
  if not exists (select 1 from public.customers c where c.id = v_customer and c.business_id = p_business_id)
     or (v_measure is not null and not exists (
           select 1 from public.measurements m where m.id = v_measure and m.business_id = p_business_id)) then
    raise exception 'Customer or measurement not found' using errcode = 'P0002';
  end if;

  -- Order number: race-free between callers of this function; the unique
  -- (business_id, order_number) still guards against the API's own path, and
  -- a clash is retried like createOrder does (3 attempts).
  v_prefix := coalesce(nullif(v_business.code, ''), 'AR');
  perform pg_advisory_xact_lock(hashtextextended('public.orders.order_number:' || p_business_id::text, 0));

  loop
    select o.order_number into v_last
      from public.orders o
     where o.business_id = p_business_id
     order by o.created_at desc
     limit 1;
    v_next := coalesce(substring(v_last from '^[A-Z]+-(\d+)')::bigint, 0) + 1;
    v_number := v_prefix || '-' ||
      case when length(v_next::text) < 5 then lpad(v_next::text, 5, '0') else v_next::text end;

    -- Typed through the table's own row type, so enum/text columns accept it.
    v_row := jsonb_populate_record(null::public.orders, jsonb_build_object(
      'business_id',         p_business_id,
      'order_number',        v_number,
      'customer_id',         v_customer,
      'booking_date',        v_booking,
      'delivery_date',       v_delivery,
      'status',              v_status,
      'comments',            p_order -> 'comments',
      'total_amount',        nullif(v_total, 0),
      'advance_paid',        nullif(v_advance, 0),
      'balance',             nullif(v_balance, 0),
      'payment_method',      v_method,
      'measurement_id',      v_measure,
      'fitting_preferences', p_order -> 'fitting_preferences'
    ));

    begin
      insert into public.orders (
        business_id, order_number, customer_id, booking_date, delivery_date, status, comments,
        total_amount, advance_paid, balance, payment_method, measurement_id, fitting_preferences
      ) values (
        v_row.business_id, v_row.order_number, v_row.customer_id, v_row.booking_date, v_row.delivery_date,
        v_row.status, v_row.comments, v_row.total_amount, v_row.advance_paid, v_row.balance,
        v_row.payment_method, v_row.measurement_id, v_row.fitting_preferences
      )
      returning * into v_order;
      exit;
    exception when unique_violation then
      v_attempt := v_attempt + 1;
      if v_attempt >= 3 then
        raise exception 'Failed to create order: order number % is taken', v_number using errcode = '23505';
      end if;
    end;
  end loop;

  if p_items is not null and jsonb_typeof(p_items) = 'array' and jsonb_array_length(p_items) > 0 then
    insert into public.order_items (order_id, order_type, description)
    select v_order.id, i.order_type, i.description
      from jsonb_populate_recordset(null::public.order_items, p_items) as i;
  end if;

  if v_advance > 0 then
    insert into public.general_ledger (business_id, entry_date, particulars, debit, entry_type, order_id, notes)
    values (
      p_business_id, v_order.booking_date,
      'Advance payment for Order #' || v_order.order_number,
      v_advance, 'order_payment', v_order.id,
      'Initial advance payment during order creation'
    );
  end if;

  return to_jsonb(v_order) || jsonb_build_object(
    'order_items',
    coalesce((select jsonb_agg(to_jsonb(oi)) from public.order_items oi where oi.order_id = v_order.id), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------- update_order
create or replace function public.update_order(
  p_order_id uuid,
  p_patch    jsonb,
  p_items    jsonb default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_old     public.orders%rowtype;
  v_new     public.orders%rowtype;
  v_set     jsonb := '{}'::jsonb;
  v_patch   jsonb := coalesce(p_patch, '{}'::jsonb);
  v_num     numeric;
  v_text    text;
  v_adv_old numeric;
  v_adv_new numeric;
  v_adv_row uuid;
begin
  perform public.order_payment_caller_role(false);
  if jsonb_typeof(v_patch) <> 'object' then
    raise exception 'Order changes must be an object' using errcode = '22023';
  end if;

  select * into v_old from public.orders where id = p_order_id for update;
  if not found or not public.order_payment_is_member(v_old.business_id) then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  -- UpdateOrderSchema (all optional). Only the keys present change.
  if v_patch ? 'customer_id' and coalesce(v_patch ->> 'customer_id', '') <> '' then
    if not exists (select 1 from public.customers c
                    where c.id = (v_patch ->> 'customer_id')::uuid and c.business_id = v_old.business_id) then
      raise exception 'Customer or measurement not found' using errcode = 'P0002';
    end if;
    v_set := v_set || jsonb_build_object('customer_id', v_patch -> 'customer_id');
  end if;
  if v_patch ? 'measurement_id' then
    v_text := nullif(v_patch ->> 'measurement_id', '');
    if v_text is not null and not exists (select 1 from public.measurements m
                    where m.id = v_text::uuid and m.business_id = v_old.business_id) then
      raise exception 'Customer or measurement not found' using errcode = 'P0002';
    end if;
    v_set := v_set || jsonb_build_object('measurement_id', v_text);
  end if;
  if coalesce(v_patch ->> 'booking_date', '') <> '' then
    v_set := v_set || jsonb_build_object('booking_date', (v_patch ->> 'booking_date')::date);
  end if;
  if coalesce(v_patch ->> 'delivery_date', '') <> '' then
    v_set := v_set || jsonb_build_object('delivery_date', (v_patch ->> 'delivery_date')::date);
  end if;
  if coalesce(v_patch ->> 'status', '') <> '' then
    if v_patch ->> 'status' not in ('In Process', 'Delivered', 'Cancelled') then
      raise exception 'Invalid order status: %', v_patch ->> 'status' using errcode = '22023';
    end if;
    v_set := v_set || jsonb_build_object('status', v_patch ->> 'status');
  end if;
  if v_patch ? 'comments' then
    if length(coalesce(v_patch ->> 'comments', '')) > 1000 then
      raise exception 'Comments too long' using errcode = '22023';
    end if;
    v_set := v_set || jsonb_build_object('comments', v_patch -> 'comments');
  end if;
  if v_patch ? 'fitting_preferences' then
    if length(coalesce(v_patch ->> 'fitting_preferences', '')) > 1000 then
      raise exception 'Fitting preferences too long' using errcode = '22023';
    end if;
    v_set := v_set || jsonb_build_object('fitting_preferences', v_patch -> 'fitting_preferences');
  end if;
  -- Amounts are stored as `value || null`, like the API.
  if v_patch ? 'total_amount' then
    v_num := coalesce(public.order_payment_num(v_patch -> 'total_amount'), 0);
    if v_num < 0 then raise exception 'Total amount must be positive' using errcode = '22023'; end if;
    v_set := v_set || jsonb_build_object('total_amount', nullif(v_num, 0));
  end if;
  if v_patch ? 'advance_paid' then
    v_num := coalesce(public.order_payment_num(v_patch -> 'advance_paid'), 0);
    if v_num < 0 then raise exception 'Advance paid cannot be negative' using errcode = '22023'; end if;
    v_set := v_set || jsonb_build_object('advance_paid', nullif(v_num, 0));
  end if;
  if v_patch ? 'balance' then
    v_num := coalesce(public.order_payment_num(v_patch -> 'balance'), 0);
    if v_num < 0 then raise exception 'Balance cannot be negative' using errcode = '22023'; end if;
    v_set := v_set || jsonb_build_object('balance', nullif(v_num, 0));
  end if;
  if v_patch ? 'payment_method' then
    v_text := nullif(v_patch ->> 'payment_method', '');
    if v_text is not null and v_text not in ('cash', 'bank', 'other') then
      raise exception 'Invalid payment method: %', v_text using errcode = '22023';
    end if;
    v_set := v_set || jsonb_build_object('payment_method', v_text);
  end if;

  perform public.order_payment_check_items(p_items);

  v_new := jsonb_populate_record(v_old, v_set);

  update public.orders
     set customer_id         = v_new.customer_id,
         measurement_id      = v_new.measurement_id,
         booking_date        = v_new.booking_date,
         delivery_date       = v_new.delivery_date,
         status              = v_new.status,
         comments            = v_new.comments,
         fitting_preferences = v_new.fitting_preferences,
         total_amount        = v_new.total_amount,
         advance_paid        = v_new.advance_paid,
         balance             = v_new.balance,
         payment_method      = v_new.payment_method,
         updated_at          = now()
   where id = p_order_id
  returning * into v_new;

  -- Items: replaced when given (an empty list removes them), as updateOrderItems.
  if p_items is not null and jsonb_typeof(p_items) = 'array' then
    delete from public.order_items where order_id = p_order_id;
    if jsonb_array_length(p_items) > 0 then
      insert into public.order_items (order_id, order_type, description)
      select p_order_id, i.order_type, i.description
        from jsonb_populate_recordset(null::public.order_items, p_items) as i;
    end if;
  end if;

  -- The advance row follows the order (difference 2 in the header).
  v_adv_old := coalesce(v_old.advance_paid, 0);
  v_adv_new := coalesce(v_new.advance_paid, 0);
  if v_adv_old is distinct from v_adv_new or v_old.booking_date is distinct from v_new.booking_date then
    v_adv_row := public.order_payment_find_advance_row(p_order_id, v_new.order_number);
    if v_adv_new > 0 then
      if v_adv_row is not null then
        update public.general_ledger
           set debit = v_adv_new, entry_date = v_new.booking_date, updated_at = now()
         where id = v_adv_row;
      else
        insert into public.general_ledger (business_id, entry_date, particulars, debit, entry_type, order_id, notes)
        values (v_new.business_id, v_new.booking_date, 'Advance payment for Order #' || v_new.order_number,
                v_adv_new, 'order_payment', p_order_id, 'Initial advance payment during order creation');
      end if;
    elsif v_adv_row is not null then
      delete from public.general_ledger where id = v_adv_row;
    end if;
  end if;

  return to_jsonb(v_new) || jsonb_build_object(
    'order_items',
    coalesce((select jsonb_agg(to_jsonb(oi)) from public.order_items oi where oi.order_id = p_order_id), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------- delete_order
create or replace function public.delete_order(p_order_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
begin
  perform public.order_payment_caller_role(true);
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or not public.order_payment_is_member(v_order.business_id) then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  -- The order's received money leaves the books with it (difference 2).
  delete from public.general_ledger
   where order_id = p_order_id and entry_type = 'order_payment' and business_id = v_order.business_id;
  delete from public.payments where order_id = p_order_id and business_id = v_order.business_id;
  delete from public.order_items where order_id = p_order_id;

  begin
    delete from public.orders where id = p_order_id;
  exception when foreign_key_violation then
    raise exception 'This order is referenced by other ledger entries and cannot be deleted'
      using errcode = '23503';
  end;

  return jsonb_build_object('id', p_order_id, 'deleted', true);
end;
$$;

-- ---------------------------------------------------------------- record_payment
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

  insert into public.general_ledger (business_id, entry_date, particulars, debit, entry_type, order_id, notes)
  values (v_order.business_id, v_date, 'Payment for Order #' || v_order.order_number, v_amount,
          'order_payment', v_order.id, coalesce(v_notes, 'Payment via ' || v_method));

  return to_jsonb(v_payment);
end;
$$;

-- ---------------------------------------------------------------- update_payment
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

  v_new := jsonb_populate_record(v_old, v_set);
  update public.payments
     set amount = v_new.amount, payment_method = v_new.payment_method,
         payment_date = v_new.payment_date, notes = v_new.notes
   where id = p_payment_id
  returning * into v_new;

  -- The payment's ledger row follows it (difference 2).
  v_ledger := public.order_payment_find_ledger_row(
    v_old.business_id, v_old.order_id, v_order.order_number, v_old.amount, v_old.payment_date,
    coalesce(nullif(v_old.notes, ''), 'Payment via ' || v_old.payment_method));
  if v_ledger is not null then
    update public.general_ledger
       set debit = v_new.amount,
           entry_date = v_new.payment_date,
           notes = coalesce(nullif(v_new.notes, ''), 'Payment via ' || v_new.payment_method),
           updated_at = now()
     where id = v_ledger;
  else
    insert into public.general_ledger (business_id, entry_date, particulars, debit, entry_type, order_id, notes)
    values (v_new.business_id, v_new.payment_date, 'Payment for Order #' || v_order.order_number, v_new.amount,
            'order_payment', v_new.order_id, coalesce(nullif(v_new.notes, ''), 'Payment via ' || v_new.payment_method));
  end if;

  return to_jsonb(v_new);
end;
$$;

-- ---------------------------------------------------------------- delete_payment
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

  v_ledger := public.order_payment_find_ledger_row(
    v_old.business_id, v_old.order_id, v_order.order_number, v_old.amount, v_old.payment_date,
    coalesce(nullif(v_old.notes, ''), 'Payment via ' || v_old.payment_method));
  if v_ledger is not null then
    delete from public.general_ledger where id = v_ledger;
  end if;

  delete from public.payments where id = p_payment_id;
  return jsonb_build_object('id', p_payment_id, 'deleted', true);
end;
$$;

-- ---------------------------------------------------------------- privileges
revoke all on function public.order_payment_caller_role(boolean) from public, anon, authenticated;
revoke all on function public.order_payment_is_member(uuid) from public, anon, authenticated;
revoke all on function public.order_payment_check_items(jsonb) from public, anon, authenticated;
revoke all on function public.order_payment_num(jsonb) from public, anon, authenticated;
revoke all on function public.order_payment_find_ledger_row(uuid, uuid, text, numeric, date, text) from public, anon, authenticated;
revoke all on function public.order_payment_find_advance_row(uuid, text) from public, anon, authenticated;

revoke all on function public.create_order(uuid, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.update_order(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.delete_order(uuid) from public, anon;
revoke all on function public.record_payment(uuid, jsonb) from public, anon;
revoke all on function public.update_payment(uuid, jsonb) from public, anon;
revoke all on function public.delete_payment(uuid) from public, anon;

grant execute on function public.create_order(uuid, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.update_order(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.delete_order(uuid) to authenticated;
grant execute on function public.record_payment(uuid, jsonb) to authenticated;
grant execute on function public.update_payment(uuid, jsonb) to authenticated;
grant execute on function public.delete_payment(uuid) to authenticated;

-- ---------------------------------------------------------------- checks
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.create_order(uuid, jsonb, jsonb, jsonb)',
    'public.update_order(uuid, jsonb, jsonb)',
    'public.delete_order(uuid)',
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
    'public.order_payment_caller_role(boolean)',
    'public.order_payment_is_member(uuid)',
    'public.order_payment_find_ledger_row(uuid, uuid, text, numeric, date, text)',
    'public.order_payment_find_advance_row(uuid, text)'
  ] loop
    if has_function_privilege('authenticated', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE') then
      raise exception 'internal helper % is executable by a client role', f;
    end if;
  end loop;

  raise notice 'order and payment functions installed';
end;
$$;

commit;
