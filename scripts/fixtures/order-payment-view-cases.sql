-- Fixtures exercising every case scripts/verify-order-payment-view.mjs must prove.
--
-- LOCAL OR STAGING ONLY. Never run against production (drdnqsjjxmqiklwfadmk):
-- it inserts synthetic customers, orders and payments.
--
--   psql   : \i scripts/fixtures/order-payment-view-cases.sql
--   docker : docker exec -i supabase_db_ar-studio-app psql -U postgres -d postgres \
--              < scripts/fixtures/order-payment-view-cases.sql
--
-- Then:  node scripts/verify-order-payment-view.mjs
-- Then:  \i scripts/fixtures/order-payment-view-cases-teardown.sql
--
-- The verifier fails by default unless zero-advance, no-payments and
-- multiple-payments are all present, so loading this is what turns a green run
-- into actual proof rather than a green run over a dataset that never tested
-- anything. Fixed UUIDs make it idempotent and make teardown exact.

begin;

insert into public.customers (id, name, phone)
values ('11111111-0000-0000-0000-000000000001', 'View Fixture Customer', '+920000000001')
on conflict (id) do nothing;

-- 1. zero advance, two payments -> paid 0+700=700, balance 300, count 2
--    A literal 0 advance must stay 0, not be read as "absent".
insert into public.orders (id, order_number, customer_id, booking_date, delivery_date, total_amount, advance_paid)
values ('22222222-0000-0000-0000-000000000001','VIEWFIX-ZERO-ADV','11111111-0000-0000-0000-000000000001','2026-01-01','2026-02-01',1000,0)
on conflict (id) do nothing;

-- 2. no payments at all -> paid 400, balance 600, count 0
--    The LEFT JOIN case: this order must still appear.
insert into public.orders (id, order_number, customer_id, booking_date, delivery_date, total_amount, advance_paid)
values ('22222222-0000-0000-0000-000000000002','VIEWFIX-NO-PAY','11111111-0000-0000-0000-000000000001','2026-01-02','2026-02-02',1000,400)
on conflict (id) do nothing;

-- 3. multiple payments -> paid 100+150=250, balance 750, count 3
--    Catches a join that multiplies rows instead of summing them.
insert into public.orders (id, order_number, customer_id, booking_date, delivery_date, total_amount, advance_paid)
values ('22222222-0000-0000-0000-000000000003','VIEWFIX-MULTI','11111111-0000-0000-0000-000000000001','2026-01-03','2026-02-03',1000,100)
on conflict (id) do nothing;

-- 4. NULL advance, one payment -> initial_advance 0, paid 250, balance 750
--    COALESCE(advance_paid, 0), distinct from case 1's literal zero.
insert into public.orders (id, order_number, customer_id, booking_date, delivery_date, total_amount, advance_paid)
values ('22222222-0000-0000-0000-000000000004','VIEWFIX-NULL-ADV','11111111-0000-0000-0000-000000000001','2026-01-04','2026-02-04',1000,null)
on conflict (id) do nothing;

-- 5. NULL total, has payments -> current_balance must be NULL, not a number.
--    total_amount is deliberately NOT coalesced: unknown total means unknown
--    balance, not "owes nothing".
insert into public.orders (id, order_number, customer_id, booking_date, delivery_date, total_amount, advance_paid)
values ('22222222-0000-0000-0000-000000000005','VIEWFIX-NULL-TOTAL','11111111-0000-0000-0000-000000000001','2026-01-05','2026-02-05',null,50)
on conflict (id) do nothing;

-- 6. fractional amounts -> 0.10 + 0.20 = 0.30 exactly, balance 99.70.
--    Proves numeric arithmetic end to end; in float this is 0.30000000000000004.
insert into public.orders (id, order_number, customer_id, booking_date, delivery_date, total_amount, advance_paid)
values ('22222222-0000-0000-0000-000000000006','VIEWFIX-FRACTION','11111111-0000-0000-0000-000000000001','2026-01-06','2026-02-06',100.00,0.10)
on conflict (id) do nothing;

insert into public.payments (id, order_id, customer_id, amount, payment_method, payment_date, created_at, updated_at) values
 ('55555555-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001',300,'cash','2026-01-10',now(),now()),
 ('55555555-0000-0000-0000-000000000002','22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001',400,'cash','2026-01-11',now(),now()),
 ('55555555-0000-0000-0000-000000000003','22222222-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000001',50,'cash','2026-01-12',now(),now()),
 ('55555555-0000-0000-0000-000000000004','22222222-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000001',50,'cash','2026-01-13',now(),now()),
 ('55555555-0000-0000-0000-000000000005','22222222-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000001',50,'cash','2026-01-14',now(),now()),
 ('55555555-0000-0000-0000-000000000006','22222222-0000-0000-0000-000000000004','11111111-0000-0000-0000-000000000001',250,'cash','2026-01-15',now(),now()),
 ('55555555-0000-0000-0000-000000000007','22222222-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000001',25,'cash','2026-01-16',now(),now()),
 ('55555555-0000-0000-0000-000000000008','22222222-0000-0000-0000-000000000006','11111111-0000-0000-0000-000000000001',0.20,'cash','2026-01-17',now(),now())
on conflict (id) do nothing;

commit;

-- Expected, for reading by eye:
--   VIEWFIX-ZERO-ADV     0.00 + 700.00 = 700.00   balance  300.00   count 2
--   VIEWFIX-NO-PAY     400.00 +   0    = 400.00   balance  600.00   count 0
--   VIEWFIX-MULTI      100.00 + 150.00 = 250.00   balance  750.00   count 3
--   VIEWFIX-NULL-ADV     0    + 250.00 = 250.00   balance  750.00   count 1
--   VIEWFIX-NULL-TOTAL  50.00 +  25.00 =  75.00   balance  (null)   count 1
--   VIEWFIX-FRACTION     0.10 +   0.20 =   0.30   balance   99.70   count 1
select order_number, initial_advance, additional_payments, total_paid, current_balance, payment_count
  from public.orders_with_payment_status
 where order_number like 'VIEWFIX-%'
 order by order_number;
