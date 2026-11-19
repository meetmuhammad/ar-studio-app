-- Drops the order-payment "Sync Payments" function.
--
-- WHY
-- ---
-- sync_order_payment_ledger (added in 20261119000300_ledger_entry_functions.sql)
-- deleted every order_payment row of a business and rebuilt them from orders and
-- payments. The owner reports that running it has always ruined the dashboard
-- figures, so the feature is removed everywhere: the Ledger page button, the
-- POST /api/general-ledger/sync-payments route and this database function.
--
-- Order-payment ledger rows are still written and kept in step by the order and
-- payment functions (20261119000100_order_payment_functions.sql); nothing calls
-- this function any more. 20261119000300 is already applied and is not edited.

begin;

drop function if exists public.sync_order_payment_ledger(uuid);

commit;
