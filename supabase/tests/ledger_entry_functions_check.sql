-- Self-contained check for 20261119000300_ledger_entry_functions.sql.
--
-- Runs in one transaction and ENDS WITH AN EXCEPTION, so everything it does is
-- rolled back even where the editor commits automatically. Success looks like
-- the final error "ALL CHECKS PASSED (rolled back on purpose)"; any other error
-- is a failed check. Run as a role that can switch to `authenticated` (e.g.
-- postgres in the SQL editor or psql). It acts as two existing users, found by
-- email, in the business named 'Ahsan Tariq Couture':
--   admin: refine-disposable-admin-20261119@arstudio.test
--   staff: refine-disposable-staff-20261119@arstudio.test
-- It creates its own vendor (rolled back) and never edits existing rows, except
-- the order-payment sync, which rebuilds that business's order_payment rows
-- and is rolled back with everything else.
--
-- Each function call runs as `authenticated` with the user's JWT claims (what
-- PostgREST does for a browser request); assertions read the tables back as
-- the original role, because the ledgers have no client grants.

begin;

do $$
declare
  c_admin_email constant text := 'refine-disposable-admin-20261119@arstudio.test';
  c_staff_email constant text := 'refine-disposable-staff-20261119@arstudio.test';
  c_business    constant text := 'Ahsan Tariq Couture';

  v_admin    uuid;
  v_staff    uuid;
  v_business uuid;
  v_vendor   uuid;
  v_misc     jsonb;
  v_pay      jsonb;
  v_pay_id   uuid;
  v_bill     jsonb;
  v_bill_id  uuid;
  v_mirror   uuid;
  v_owned    uuid;
  v_read     jsonb;
  v_sync     jsonb;
  v_count    int;
  v_num      numeric;
  v_ok       boolean;
  v_today    date := (now() at time zone 'Asia/Karachi')::date;
  v_orig_role text := current_user;
  v_tag      text := 'ledger fn check ' || to_char(clock_timestamp(), 'HH24MISSUS');
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

  insert into public.vendors (business_id, name) values (v_business, v_tag || ' vendor') returning id into v_vendor;

  -- Running-balance mismatches of the business's book: stored balance vs an
  -- independent cumulative sum in (entry_date, created_at, id) order.
  select count(*) into v_count from (
    select gl.balance, sum(coalesce(gl.debit, 0) - coalesce(gl.credit, 0))
             over (order by gl.entry_date, gl.created_at, gl.id rows between unbounded preceding and current row) as expected
      from public.general_ledger gl where gl.business_id = v_business
  ) t where t.balance is distinct from t.expected;
  if v_count > 0 then
    raise exception 'baseline: % general_ledger rows already disagree with the cumulative sum (fix before testing)', v_count;
  end if;
  raise notice 'fixtures: admin %, staff %, business %, vendor %; baseline mismatches 0', v_admin, v_staff, v_business, v_vendor;

  -- ------------------------------------------------------------- 1. admin creates a miscellaneous debit
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_misc := public.create_ledger_entry(v_business, jsonb_build_object(
    'entry_date', v_today, 'entry_type', 'miscellaneous', 'particulars', '  ' || v_tag || ' misc  ',
    'debit', 1000, 'credit', null, 'notes', ''));
  perform set_config('role', v_orig_role, true);
  if v_misc ->> 'particulars' <> v_tag || ' misc' or (v_misc ->> 'debit')::numeric <> 1000 or v_misc ->> 'notes' is not null then
    raise exception 'create_ledger_entry stored %', v_misc;
  end if;
  raise notice 'ok: admin created a miscellaneous entry';

  -- ------------------------------------------------------------- 2. vendor payment: particulars default, one mirror row
  perform set_config('role', 'authenticated', true);
  v_pay := public.create_ledger_entry(v_business, jsonb_build_object(
    'entry_date', v_today, 'entry_type', 'vendor_payment', 'particulars', '',
    'credit', 2500, 'vendor_id', v_vendor));
  perform set_config('role', v_orig_role, true);
  v_pay_id := (v_pay ->> 'id')::uuid;
  if v_pay ->> 'particulars' <> v_tag || ' vendor' then
    raise exception 'vendor payment particulars should default to the vendor name, got %', v_pay ->> 'particulars';
  end if;
  select count(*), max(debit) into v_count, v_num from public.vendor_ledger where general_ledger_id = v_pay_id;
  if v_count <> 1 or v_num <> 2500 then
    raise exception 'vendor mirror: % rows, debit % (expected 1 row, debit 2500)', v_count, v_num;
  end if;
  raise notice 'ok: vendor payment with one mirror row (GL credit = vendor debit)';

  -- ------------------------------------------------------------- 3. edit: amount and a back-dated date
  perform set_config('role', 'authenticated', true);
  perform public.update_ledger_entry(v_pay_id, jsonb_build_object(
    'entry_date', v_today - 40, 'entry_type', 'vendor_payment', 'particulars', v_tag || ' paid',
    'credit', 3000, 'vendor_id', v_vendor, 'notes', 'edited'));
  perform set_config('role', v_orig_role, true);
  select count(*), max(debit) into v_count, v_num from public.vendor_ledger where general_ledger_id = v_pay_id;
  if v_count <> 1 or v_num <> 3000 then
    raise exception 'after edit, vendor mirror: % rows, debit % (expected 1, 3000)', v_count, v_num;
  end if;
  if (select entry_date from public.general_ledger where id = v_pay_id) <> v_today - 40 then
    raise exception 'edit did not move the entry date';
  end if;
  raise notice 'ok: admin edited the vendor payment (mirror rewritten)';

  -- ------------------------------------------------------------- 4. vendor bill and the vendor read
  perform set_config('role', 'authenticated', true);
  v_bill := public.record_vendor_bill(v_vendor, jsonb_build_object(
    'entry_date', v_today - 10, 'particulars', v_tag || ' bill', 'amount', 5000, 'notes', 'fabric'));
  v_bill_id := (v_bill ->> 'id')::uuid;
  v_read := public.vendor_ledger_entries(v_vendor);
  perform set_config('role', v_orig_role, true);
  if v_bill ->> 'general_ledger_id' is not null or (v_bill ->> 'credit')::numeric <> 5000 then
    raise exception 'record_vendor_bill stored %', v_bill;
  end if;
  if (v_read #>> '{totals,billed}')::numeric <> 5000 or (v_read #>> '{totals,paid}')::numeric <> 3000
     or (v_read #>> '{totals,owed}')::numeric <> 2000 or (v_read #>> '{totals,entries}')::int <> 2 then
    raise exception 'vendor totals wrong: %', v_read -> 'totals';
  end if;
  if (v_read #>> '{rows,0,owed_after}')::numeric <> 2000 then
    raise exception 'newest owed_after should be 2000, got %', v_read #>> '{rows,0,owed_after}';
  end if;
  raise notice 'ok: bill recorded; billed 5000, paid 3000, owed 2000';

  perform set_config('role', 'authenticated', true);
  perform public.update_vendor_bill(v_bill_id, jsonb_build_object(
    'entry_date', v_today - 10, 'particulars', v_tag || ' bill', 'credit', 4500));
  v_read := public.vendor_ledger_entries(v_vendor);
  perform set_config('role', v_orig_role, true);
  if (v_read #>> '{totals,owed}')::numeric <> 1500 then
    raise exception 'after bill edit owed should be 1500, got %', v_read #>> '{totals,owed}';
  end if;
  raise notice 'ok: bill edited; owed 1500';

  -- A mirror row cannot be edited or deleted as a bill.
  select id into v_mirror from public.vendor_ledger where general_ledger_id = v_pay_id;
  perform set_config('role', 'authenticated', true);
  begin
    perform public.update_vendor_bill(v_mirror, jsonb_build_object('entry_date', v_today, 'particulars', 'x', 'credit', 1));
    v_ok := false;
  exception when check_violation then v_ok := true;
  end;
  perform set_config('role', v_orig_role, true);
  if not v_ok then raise exception 'a payment mirror was editable as a bill'; end if;
  raise notice 'ok: mirror rows are not bills';

  -- ------------------------------------------------------------- 5. running balances, 0 mismatches
  select count(*) into v_count from (
    select gl.balance, sum(coalesce(gl.debit, 0) - coalesce(gl.credit, 0))
             over (order by gl.entry_date, gl.created_at, gl.id rows between unbounded preceding and current row) as expected
      from public.general_ledger gl where gl.business_id = v_business
  ) t where t.balance is distinct from t.expected;
  if v_count > 0 then raise exception 'general_ledger: % mismatches after create/edit', v_count; end if;
  select count(*) into v_count from (
    select vl.balance, sum(coalesce(vl.debit, 0) - coalesce(vl.credit, 0))
             over (order by vl.entry_date, vl.created_at, vl.id rows between unbounded preceding and current row) as expected
      from public.vendor_ledger vl where vl.vendor_id = v_vendor
  ) t where t.balance is distinct from t.expected;
  if v_count > 0 then raise exception 'vendor_ledger: % mismatches after create/edit', v_count; end if;
  raise notice 'ok: 0 running-balance mismatches (general and vendor ledger)';

  -- ------------------------------------------------------------- 6. staff are refused (42501)
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_count := 0;
  begin
    perform public.create_ledger_entry(v_business, jsonb_build_object('entry_date', v_today, 'entry_type', 'miscellaneous', 'particulars', 'staff', 'debit', 1));
  exception when insufficient_privilege then v_count := v_count + 1;
  end;
  begin
    perform public.update_ledger_entry((v_misc ->> 'id')::uuid, jsonb_build_object('entry_date', v_today, 'entry_type', 'miscellaneous', 'particulars', 'staff', 'debit', 1));
  exception when insufficient_privilege then v_count := v_count + 1;
  end;
  begin
    perform public.delete_ledger_entry((v_misc ->> 'id')::uuid);
  exception when insufficient_privilege then v_count := v_count + 1;
  end;
  begin
    perform public.record_vendor_bill(v_vendor, jsonb_build_object('entry_date', v_today, 'particulars', 'staff', 'amount', 1));
  exception when insufficient_privilege then v_count := v_count + 1;
  end;
  begin
    perform public.delete_vendor_bill(v_bill_id);
  exception when insufficient_privilege then v_count := v_count + 1;
  end;
  begin
    perform public.vendor_ledger_entries(v_vendor);
  exception when insufficient_privilege then v_count := v_count + 1;
  end;
  begin
    perform public.sync_order_payment_ledger(v_business);
  exception when insufficient_privilege then v_count := v_count + 1;
  end;
  perform set_config('role', v_orig_role, true);
  if v_count <> 7 then raise exception 'staff were refused % of 7 calls', v_count; end if;
  raise notice 'ok: staff refused (42501) on all 7 calls';

  -- ------------------------------------------------------------- 7. order-owned rows are refused
  insert into public.general_ledger (business_id, entry_date, particulars, debit, entry_type, notes)
  values (v_business, v_today, v_tag || ' order row', 700, 'order_payment', 'check')
  returning id into v_owned;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_count := 0;
  begin
    perform public.update_ledger_entry(v_owned, jsonb_build_object('entry_date', v_today, 'entry_type', 'miscellaneous', 'particulars', 'x', 'debit', 1));
  exception when check_violation then v_count := v_count + 1;
  end;
  begin
    perform public.delete_ledger_entry(v_owned);
  exception when check_violation then v_count := v_count + 1;
  end;
  begin
    perform public.create_ledger_entry(v_business, jsonb_build_object('entry_date', v_today, 'entry_type', 'order_payment', 'particulars', 'x', 'debit', 1));
  exception when check_violation then v_count := v_count + 1;
  end;
  perform set_config('role', v_orig_role, true);
  if v_count <> 3 then raise exception 'order-owned rows: % of 3 calls refused', v_count; end if;
  if not exists (select 1 from public.general_ledger where id = v_owned and debit = 700) then
    raise exception 'the order-owned row was changed';
  end if;
  raise notice 'ok: order-owned rows cannot be created, edited or deleted manually (23514)';

  -- ------------------------------------------------------------- 8. invalid input
  perform set_config('role', 'authenticated', true);
  begin
    perform public.create_ledger_entry(v_business, jsonb_build_object('entry_date', v_today, 'entry_type', 'miscellaneous', 'particulars', 'x', 'debit', 1, 'credit', 1));
    v_ok := false;
  exception when invalid_parameter_value then v_ok := true;
  end;
  perform set_config('role', v_orig_role, true);
  if not v_ok then raise exception 'debit and credit together were accepted'; end if;
  raise notice 'ok: debit and credit together refused (22023)';

  -- ------------------------------------------------------------- 9. deletes
  perform set_config('role', 'authenticated', true);
  perform public.delete_ledger_entry((v_misc ->> 'id')::uuid);
  perform public.delete_ledger_entry(v_pay_id);
  perform public.delete_vendor_bill(v_bill_id);
  perform set_config('role', v_orig_role, true);
  if exists (select 1 from public.general_ledger where id in ((v_misc ->> 'id')::uuid, v_pay_id))
     or exists (select 1 from public.vendor_ledger where vendor_id = v_vendor) then
    raise exception 'deletes left rows behind';
  end if;
  select count(*) into v_count from (
    select gl.balance, sum(coalesce(gl.debit, 0) - coalesce(gl.credit, 0))
             over (order by gl.entry_date, gl.created_at, gl.id rows between unbounded preceding and current row) as expected
      from public.general_ledger gl where gl.business_id = v_business
  ) t where t.balance is distinct from t.expected;
  if v_count > 0 then raise exception 'general_ledger: % mismatches after deletes', v_count; end if;
  raise notice 'ok: deletes removed the entries and their mirror; 0 mismatches';

  -- ------------------------------------------------------------- 10. order-payment sync (admin)
  perform set_config('role', 'authenticated', true);
  v_sync := public.sync_order_payment_ledger(v_business);
  perform set_config('role', v_orig_role, true);
  select count(*) into v_count from public.general_ledger where business_id = v_business and entry_type = 'order_payment';
  if v_count <> (v_sync ->> 'synced')::int
     or (v_sync ->> 'orders')::int <> (select count(*) from public.orders where business_id = v_business and advance_paid > 0)
     or (v_sync ->> 'payments')::int <> (select count(*) from public.payments where business_id = v_business) then
    raise exception 'sync result % does not match the orders, payments and rows (% rows)', v_sync, v_count;
  end if;
  select count(*) into v_count from (
    select gl.balance, sum(coalesce(gl.debit, 0) - coalesce(gl.credit, 0))
             over (order by gl.entry_date, gl.created_at, gl.id rows between unbounded preceding and current row) as expected
      from public.general_ledger gl where gl.business_id = v_business
  ) t where t.balance is distinct from t.expected;
  if v_count > 0 then raise exception 'general_ledger: % mismatches after sync', v_count; end if;
  raise notice 'ok: sync rebuilt % order payment rows; 0 mismatches', v_sync ->> 'synced';

  -- ------------------------------------------------------------- 11. anonymous caller
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.create_ledger_entry(v_business, jsonb_build_object('entry_date', v_today, 'entry_type', 'miscellaneous', 'particulars', 'x', 'debit', 1));
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  perform set_config('role', v_orig_role, true);
  if not v_ok then raise exception 'a caller without a user id could write the ledger'; end if;
  raise notice 'ok: no user id, no write';

  -- Ending in an exception rolls everything back, whatever the client does.
  raise exception 'ALL CHECKS PASSED (rolled back on purpose)';
end;
$$;

rollback;
