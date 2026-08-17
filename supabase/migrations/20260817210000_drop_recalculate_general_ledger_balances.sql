-- SECURITY HOTFIX: remove a whole-ledger rewrite function that any signed-in
-- user can execute.
--
-- public.recalculate_general_ledger_balances() is LANGUAGE plpgsql with NO
-- SECURITY DEFINER, so it runs with the caller's rights, and its body loops
-- every row of public.general_ledger issuing
--   UPDATE public.general_ledger SET balance = running_balance WHERE id = ...
--
-- It is granted to anon and authenticated, and general_ledger's RLS policy is
-- FOR ALL to any authenticated caller, so the UPDATE is permitted. PostgREST
-- exposes it at POST /rest/v1/rpc/recalculate_general_ledger_balances.
--
-- CONFIRMED LIVE on both hosted projects by a read-only privilege check:
--   production  authenticated EXECUTE = true, anon EXECUTE = true
--   staging     authenticated EXECUTE = true, anon EXECUTE = true
--
-- REPRODUCED on a local database built from the same baseline: a user with no
-- row in public.users at all -- no role, not staff, not admin -- called the
-- endpoint, received HTTP 204, and rewrote a ledger balance from 999999.00 to
-- 662500.00.
--
-- WHY DROP RATHER THAN REVOKE
--
--   * Zero application callers. `grep -rn recalculate_general_ledger_balances src/`
--     returns nothing.
--   * Superseded by rebuild_general_ledger_balances() (20260817140000), which
--     has the correct ordering, a re-entrancy guard, and service_role-only
--     EXECUTE.
--   * Its ordering is wrong anyway: it sorts (entry_date, created_at) with no
--     id tiebreak, while the canonical order is (entry_date, created_at, id).
--     Tied rows would be assigned balances disagreeing with what the ledger
--     page and the CSV export display.
--   * A revoked-but-present dead financial function is one careless migration
--     away from being re-granted.
--
-- NO CASCADE, deliberately. Nothing in the schema references this function --
-- no trigger, no other function, no column default; the baseline contains only
-- its definition, its owner line and three GRANTs. If some dependency exists
-- that was not found, this statement RAISES and the migration aborts, which is
-- the intended behaviour: stop and report rather than silently removing more
-- than intended.
--
-- SCOPE: this function only.
--
-- recalculate_all_balances() carries the same broad grants but RETURNS trigger,
-- so PostgREST cannot expose it as an RPC -- a call returns 404 PGRST202, not
-- execution. It is therefore not the same confirmed vulnerability and is left
-- alone here; it belongs to backlog cleanup, not to a production security
-- hotfix.
--
-- This migration does not touch ledger data. It removes a function. No balance,
-- debit, credit, entry_date, order or payment row is read or written.

drop function if exists public.recalculate_general_ledger_balances();

-- Fail loudly rather than reporting success on a half-applied state.
do $$
begin
  if to_regprocedure('public.recalculate_general_ledger_balances()') is not null then
    raise exception
      'recalculate_general_ledger_balances() is still present after DROP';
  end if;
  raise notice 'recalculate_general_ledger_balances() is absent';
end $$;
