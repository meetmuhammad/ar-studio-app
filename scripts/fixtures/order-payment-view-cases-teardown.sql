-- Removes everything scripts/fixtures/order-payment-view-cases.sql inserted.
--
-- Deletes by the fixed fixture UUIDs and the VIEWFIX- prefix only, so it cannot
-- touch real records even if run against a populated database. Payments go
-- first: orders are the parent, and relying on the cascade to clean up would
-- exercise exactly the silent-deletion behaviour this programme is removing.
--
-- LOCAL OR STAGING ONLY.

begin;

delete from public.payments
 where order_id in (select id from public.orders where order_number like 'VIEWFIX-%');

delete from public.orders
 where order_number like 'VIEWFIX-%';

delete from public.customers
 where id = '11111111-0000-0000-0000-000000000001';

commit;

select
  (select count(*) from public.orders   where order_number like 'VIEWFIX-%') as orders_left,
  (select count(*) from public.payments where id::text like '55555555-%')     as payments_left,
  (select count(*) from public.customers where id = '11111111-0000-0000-0000-000000000001') as customers_left;
