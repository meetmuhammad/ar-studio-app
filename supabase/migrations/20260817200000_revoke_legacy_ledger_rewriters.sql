-- Remove the legacy whole-ledger rewrite functions.
--
-- FOUND BY CODE REVIEW, THEN REPRODUCED. `public.recalculate_general_ledger_balances()`
-- came in with the captured baseline. It is LANGUAGE plpgsql with NO SECURITY
-- DEFINER, so it runs with the caller's rights, and its body is an UPDATE over
-- every row of public.general_ledger. The baseline also grants it broadly:
--
--   GRANT ALL ON FUNCTION public.recalculate_general_ledger_balances() TO anon;
--   GRANT ALL ON FUNCTION public.recalculate_general_ledger_balances() TO authenticated;
--
-- and general_ledger's RLS policy is FOR ALL to any authenticated caller, so the
-- UPDATE is permitted. Demonstrated end to end on a database built from these
-- migrations: a freshly created user with NO row in public.users at all -- no
-- role, not staff, not admin -- called
-- POST /rest/v1/rpc/recalculate_general_ledger_balances, received HTTP 204, and
-- rewrote a balance from 999999.00 to 662500.00.
--
-- Any signed-in user could rewrite the studio's books.
--
-- 20260817140000 closed exactly this class for its own functions -- revoking
-- from public/anon/authenticated and dropping the superseded
-- recalc_balance_after_update/delete and recalculate_balances_after_date -- but
-- it never touched this one, because it predates the baseline being restored to
-- this lineage. The two changes only met here.
--
-- It is also WRONG, independently of the privilege problem: it orders by
-- (entry_date, created_at) with no id tiebreak, while the canonical order
-- installed by 20260817140000 is (entry_date, created_at, id). Two rows tying on
-- the first two columns would be assigned balances in an order that disagrees
-- with what the ledger page and the CSV export display.
--
-- DROP rather than REVOKE. Nothing calls these: `grep -rn` across src/ returns
-- zero references to all three, and rebuild_general_ledger_balances() from
-- 20260817140000 supersedes them with correct ordering, a re-entrancy guard and
-- service_role-only execute. A revoked-but-present function is a loaded gun with
-- the safety on; someone re-granting it later is one careless migration away.
--
-- calculate_order_balance(uuid) is read-only and harmless by comparison, but it
-- computes an order balance by a rule that predates the payment-aware view and
-- would be a tempting wrong answer for a future caller. It has no callers either.

drop function if exists public.recalculate_general_ledger_balances();
drop function if exists public.recalculate_all_balances();
drop function if exists public.calculate_order_balance(uuid);

-- Belt and braces: if a future baseline recapture reintroduces any of them,
-- they must not arrive executable by the browser-facing roles. These are no-ops
-- while the functions are absent.
do $$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'public.recalculate_general_ledger_balances()',
    'public.recalculate_all_balances()',
    'public.calculate_order_balance(uuid)'
  ] loop
    if to_regprocedure(v_sig) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', v_sig);
    end if;
  end loop;
end $$;

-- Assert the hole is closed, so this migration fails rather than silently
-- half-applying.
do $$
declare
  v_left text;
begin
  select string_agg(p.proname, ', ') into v_left
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('recalculate_general_ledger_balances', 'recalculate_all_balances')
     and (has_function_privilege('anon', p.oid, 'EXECUTE')
       or has_function_privilege('authenticated', p.oid, 'EXECUTE'));

  if v_left is not null then
    raise exception
      'anon/authenticated still hold EXECUTE on whole-ledger rewrite functions: %', v_left;
  end if;
end $$;
