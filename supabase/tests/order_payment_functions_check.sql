-- Self-contained check for 20261119000100_order_payment_functions.sql.
--
-- Runs in one transaction and ROLLS BACK: nothing it creates is kept.
-- Run as a role that can switch to `authenticated` (e.g. postgres in the SQL
-- editor or psql). It acts as two existing users, found by email:
--   admin: refine-disposable-admin-20261119@arstudio.test
--   staff: refine-disposable-staff-20261119@arstudio.test
-- in the business named 'Ahsan Tariq Couture', using one of its customers.
--
-- Each call to a function runs as `authenticated` with that user's JWT claims
-- (what PostgREST does for a browser request); assertions read the tables
-- back as the original role, because general_ledger has no client grants.
-- Every assertion raises a NOTICE; the first failure raises an exception.

begin;

do $$
declare
  c_admin_email constant text := 'refine-disposable-admin-20261119@arstudio.test';
  c_staff_email constant text := 'refine-disposable-staff-20261119@arstudio.test';
  c_business    constant text := 'Ahsan Tariq Couture';

  v_admin     uuid;
  v_staff     uuid;
  v_business  uuid;
  v_customer  uuid;
  v_order     jsonb;
  v_order_id  uuid;
  v_number    text;
  v_staff_ord jsonb;
  v_payment   jsonb;
  v_pay_id    uuid;
  v_count     int;
  v_num       numeric;
  v_ok        boolean;
  v_today     date := (now() at time zone 'utc')::date;

  -- Runs SQL as the given user (role authenticated + JWT claims), then
  -- returns to the original role. Implemented inline below as a pattern:
  --   perform set_config('request.jwt.claims', ..., true);
  --   perform set_config('role', 'authenticated', true);
  --   ... call ...
  --   perform set_config('role', v_orig_role, true);
  v_orig_role text := current_user;
begin
  -- ------------------------------------------------------------- fixtures
  select id into v_admin from public.users where email = c_admin_email;
  select id into v_staff from public.users where email = c_staff_email;
  select id into v_business from public.businesses where name = c_business;
  if v_admin is null or v_staff is null or v_business is null then
    raise exception 'fixtures missing: admin %, staff %, business %', v_admin, v_staff, v_business;
  end if;
  if (select role from public.users where id = v_admin) <> 'admin'
     or (select role from public.users where id = v_staff) <> 'staff' then
    raise exception 'fixture roles are wrong (expected admin and staff)';
  end if;
  if not exists (select 1 from public.user_businesses where user_id = v_admin and business_id = v_business)
     or not exists (select 1 from public.user_businesses where user_id = v_staff and business_id = v_business) then
    raise exception 'both fixture users must be members of %', c_business;
  end if;
  select id into v_customer from public.customers where business_id = v_business order by created_at limit 1;
  if v_customer is null then
    raise exception 'no customer in %', c_business;
  end if;
  raise notice 'fixtures: admin %, staff %, business %, customer %', v_admin, v_staff, v_business, v_customer;

  -- ------------------------------------------------------------- 1. create (admin)
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_order := public.create_order(
    v_business,
    jsonb_build_object(
      'customer_id', v_customer,
      'booking_date', v_today,
      'delivery_date', v_today + 7,
      'status', 'In Process',
      'comments', 'function check',
      'total_amount', 10000,
      'balance', 7000,
      'fitting_preferences', 'slim'
    ),
    '[{"order_type":"nikkah","description":"Sherwani"},{"order_type":"mehndi","description":"Kurta"}]'::jsonb,
    '{"amount":3000,"payment_method":"cash"}'::jsonb
  );
  perform set_config('role', v_orig_role, true);

  v_order_id := (v_order ->> 'id')::uuid;
  v_number   := v_order ->> 'order_number';
  if v_number !~ '^[A-Z]+-\d{5,}$' then
    raise exception 'order number % does not match <code>-#####', v_number;
  end if;
  raise notice 'ok: created order % (%)', v_number, v_order_id;

  select count(*) into v_count from public.order_items where order_id = v_order_id;
  if v_count <> 2 then raise exception 'expected 2 items, found %', v_count; end if;
  raise notice 'ok: 2 order items';

  select advance_paid into v_num from public.orders where id = v_order_id;
  if v_num <> 3000 then raise exception 'advance_paid is %, expected 3000', v_num; end if;
  raise notice 'ok: advance_paid 3000';

  select count(*) into v_count from public.general_ledger
   where order_id = v_order_id and entry_type = 'order_payment'
     and particulars = 'Advance payment for Order #' || v_number
     and debit = 3000 and entry_date = v_today
     and notes = 'Initial advance payment during order creation';
  if v_count <> 1 then raise exception 'expected 1 advance ledger row, found %', v_count; end if;
  raise notice 'ok: advance ledger row';

  select count(*) into v_count from public.payments where order_id = v_order_id;
  if v_count <> 0 then raise exception 'create_order must not create a payments row (API parity), found %', v_count; end if;
  raise notice 'ok: no payments row for the advance';

  -- Running balance: the business's last ledger row equals its debit - credit total.
  select (select gl.balance from public.general_ledger gl
           where gl.business_id = v_business
           order by gl.entry_date desc, gl.created_at desc, gl.id desc limit 1)
       = (select sum(coalesce(debit, 0) - coalesce(credit, 0)) from public.general_ledger where business_id = v_business)
    into v_ok;
  if not v_ok then raise exception 'running balance is out of step after create'; end if;
  raise notice 'ok: running balance after create';

  -- ------------------------------------------------------------- 2. staff can create, cannot delete or pay
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_staff_ord := public.create_order(
    v_business,
    jsonb_build_object('customer_id', v_customer, 'booking_date', v_today, 'delivery_date', v_today, 'total_amount', 500),
    null, null);
  perform set_config('role', v_orig_role, true);
  if (select count(*) from public.general_ledger where order_id = (v_staff_ord ->> 'id')::uuid) <> 0 then
    raise exception 'an order without advance must not write the ledger';
  end if;
  raise notice 'ok: staff created order % (no advance, no ledger row)', v_staff_ord ->> 'order_number';

  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.delete_order(v_order_id);
    v_ok := false;
  exception when insufficient_privilege then
    v_ok := true;
  end;
  perform set_config('role', v_orig_role, true);
  if not v_ok then raise exception 'staff could delete an order'; end if;
  raise notice 'ok: staff cannot delete an order';

  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.record_payment(v_order_id, '{"amount":100}'::jsonb);
    v_ok := false;
  exception when insufficient_privilege then
    v_ok := true;
  end;
  perform set_config('role', v_orig_role, true);
  if not v_ok then raise exception 'staff could record a payment'; end if;
  raise notice 'ok: staff cannot record a payment';

  -- Validation: advance above total is refused.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.create_order(v_business,
      jsonb_build_object('customer_id', v_customer, 'booking_date', v_today, 'delivery_date', v_today, 'total_amount', 100),
      null, '{"amount":500}'::jsonb);
    v_ok := false;
  exception when check_violation then
    v_ok := true;
  end;
  perform set_config('role', v_orig_role, true);
  if not v_ok then raise exception 'advance above total was accepted'; end if;
  raise notice 'ok: advance above total refused';

  -- ------------------------------------------------------------- 3. record payment (admin)
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_payment := public.record_payment(v_order_id,
    jsonb_build_object('amount', 2000, 'payment_method', 'bank', 'payment_date', v_today));
  perform set_config('role', v_orig_role, true);
  v_pay_id := (v_payment ->> 'id')::uuid;

  select count(*) into v_count from public.general_ledger
   where order_id = v_order_id and entry_type = 'order_payment'
     and particulars = 'Payment for Order #' || v_number and debit = 2000 and notes = 'Payment via bank';
  if v_count <> 1 then raise exception 'expected 1 payment ledger row, found %', v_count; end if;
  raise notice 'ok: payment % and its ledger row', v_pay_id;

  -- ------------------------------------------------------------- 4. update payment
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.update_payment(v_pay_id, '{"amount":2500,"notes":"corrected"}'::jsonb);
  perform set_config('role', v_orig_role, true);

  select count(*) into v_count from public.general_ledger
   where order_id = v_order_id and particulars = 'Payment for Order #' || v_number;
  if v_count <> 1 then raise exception 'expected 1 payment ledger row after update, found %', v_count; end if;
  select debit into v_num from public.general_ledger
   where order_id = v_order_id and particulars = 'Payment for Order #' || v_number;
  if v_num <> 2500 then raise exception 'payment ledger debit is %, expected 2500', v_num; end if;
  if (select notes from public.general_ledger where order_id = v_order_id and particulars = 'Payment for Order #' || v_number) <> 'corrected' then
    raise exception 'payment ledger notes not updated';
  end if;
  if (select advance_paid from public.orders where id = v_order_id) <> 3000 then
    raise exception 'update_payment changed the order advance';
  end if;
  raise notice 'ok: payment updated to 2500, ledger row follows, order untouched';

  -- ------------------------------------------------------------- 5. update order (advance + items)
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.update_order(v_order_id,
    '{"advance_paid":4000,"balance":6000,"status":"Delivered"}'::jsonb,
    '[{"order_type":"barat","description":"Lehenga"}]'::jsonb);
  perform set_config('role', v_orig_role, true);

  select count(*) into v_count from public.order_items where order_id = v_order_id;
  if v_count <> 1 then raise exception 'expected 1 item after replace, found %', v_count; end if;
  select debit into v_num from public.general_ledger
   where order_id = v_order_id and particulars = 'Advance payment for Order #' || v_number;
  if v_num <> 4000 then raise exception 'advance ledger debit is %, expected 4000', v_num; end if;
  if (select status from public.orders where id = v_order_id)::text <> 'Delivered' then
    raise exception 'status not updated';
  end if;
  if (select total_amount from public.orders where id = v_order_id) <> 10000 then
    raise exception 'update_order cleared total_amount although it was not in the patch';
  end if;
  raise notice 'ok: order updated (advance 4000 in ledger, 1 item, status Delivered, total kept)';

  select (select gl.balance from public.general_ledger gl
           where gl.business_id = v_business
           order by gl.entry_date desc, gl.created_at desc, gl.id desc limit 1)
       = (select sum(coalesce(debit, 0) - coalesce(credit, 0)) from public.general_ledger where business_id = v_business)
    into v_ok;
  if not v_ok then raise exception 'running balance is out of step after updates'; end if;
  raise notice 'ok: running balance after updates';

  -- ------------------------------------------------------------- 6. delete payment
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.delete_payment(v_pay_id);
  perform set_config('role', v_orig_role, true);

  if exists (select 1 from public.payments where id = v_pay_id) then
    raise exception 'payment still exists';
  end if;
  select count(*) into v_count from public.general_ledger
   where order_id = v_order_id and particulars = 'Payment for Order #' || v_number;
  if v_count <> 0 then raise exception 'payment ledger row still exists after delete'; end if;
  raise notice 'ok: payment and its ledger row deleted';

  -- ------------------------------------------------------------- 7. delete order (admin)
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.delete_order(v_order_id);
  perform public.delete_order((v_staff_ord ->> 'id')::uuid);
  perform set_config('role', v_orig_role, true);

  if exists (select 1 from public.orders where id = v_order_id) then
    raise exception 'order still exists';
  end if;
  select count(*) into v_count from public.order_items where order_id = v_order_id;
  if v_count <> 0 then raise exception 'order items left behind: %', v_count; end if;
  select count(*) into v_count from public.general_ledger where order_id = v_order_id and entry_type = 'order_payment';
  if v_count <> 0 then raise exception 'order ledger rows left behind: %', v_count; end if;
  raise notice 'ok: order, items and its order_payment ledger rows deleted';

  select (select gl.balance from public.general_ledger gl
           where gl.business_id = v_business
           order by gl.entry_date desc, gl.created_at desc, gl.id desc limit 1)
         is not distinct from
         (select sum(coalesce(debit, 0) - coalesce(credit, 0)) from public.general_ledger where business_id = v_business)
    into v_ok;
  if not v_ok then raise exception 'running balance is out of step after deletes'; end if;
  raise notice 'ok: running balance after deletes';

  -- ------------------------------------------------------------- 8. anonymous caller
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.create_order(v_business, jsonb_build_object('customer_id', v_customer), null, null);
    v_ok := false;
  exception when insufficient_privilege then
    v_ok := true;
  end;
  perform set_config('role', v_orig_role, true);
  if not v_ok then raise exception 'a caller without a user id could create an order'; end if;
  raise notice 'ok: no user id, no order';

  raise notice 'ALL CHECKS PASSED (rolling back)';
end;
$$;

rollback;
