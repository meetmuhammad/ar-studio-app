#!/usr/bin/env bash
# Concurrent general_ledger writers, after the per-business partition
# (supabase/migrations/20261106000000_multi_business_techlink.sql).
#
#  1. Same business: one session appends and holds its transaction open, a
#     second back-dates. The per-business advisory lock must make the second
#     wait, and the chain must be whole afterwards.
#  2. Different business: a writer in another business must NOT wait for that
#     lock (ATC and Techlink never serialise on each other).
#  3. No other business's stored balance moves.
#
# LOCAL/TEST ONLY. Uses two throwaway businesses (slugs zz-cc-a / zz-cc-b),
# commits rows into them, and deletes the rows and the businesses at the end.
#
#   scripts/ledger-balance/concurrency.test.sh [db]   (default: postgres)
set -euo pipefail

DB="${1:-postgres}"
psql_() { docker exec -i supabase_db_ar-studio-app psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -qAt "$@"; }

cleanup() {
  psql_ -c "delete from public.general_ledger where business_id in (select id from public.businesses where slug in ('zz-cc-a','zz-cc-b'));
            delete from public.businesses where slug in ('zz-cc-a','zz-cc-b');" >/dev/null
}
trap cleanup EXIT
cleanup

psql_ -c "insert into public.businesses (name, slug, code) values ('CC A', 'zz-cc-a', 'ZA'), ('CC B', 'zz-cc-b', 'ZB')" >/dev/null
A_ID=$(psql_ -c "select id from public.businesses where slug = 'zz-cc-a'")
B_ID=$(psql_ -c "select id from public.businesses where slug = 'zz-cc-b'")
OTHERS_BEFORE=$(psql_ -c "select md5(coalesce(string_agg(id::text || ':' || balance::text, ',' order by id), '')) from public.general_ledger where business_id not in ('$A_ID','$B_ID')")

psql_ -c "insert into public.general_ledger (business_id, entry_date, created_at, particulars, debit, entry_type)
          values ('$A_ID', '2026-10-01', '2026-10-01 10:00+05', 'cc opening', 1000, 'opening_balance'),
                 ('$A_ID', '2026-10-30', '2026-10-30 10:00+05', 'cc later', 500, 'miscellaneous')" >/dev/null

# Session 1 (business A) holds its transaction open for 3s after writing.
psql_ -c "begin;
          insert into public.general_ledger (business_id, entry_date, particulars, debit, entry_type)
          values ('$A_ID', '2026-10-31', 'cc append', 100, 'miscellaneous');
          select pg_sleep(3);
          commit;" >/dev/null &
S1=$!
sleep 0.5

# Session 2 (same business A, back-dated): must wait for session 1.
( start=$(date +%s); psql_ -c "set lock_timeout = '10s';
          insert into public.general_ledger (business_id, entry_date, particulars, debit, entry_type)
          values ('$A_ID', '2026-10-15', 'cc backdated', 77000, 'order_payment');" >/dev/null
  echo $(( $(date +%s) - start )) > /tmp/.cc_same_$$ ) &
S2=$!

# Session 3 (business B): must not wait.
( start=$(date +%s); psql_ -c "set lock_timeout = '10s';
          insert into public.general_ledger (business_id, entry_date, particulars, debit, entry_type)
          values ('$B_ID', '2026-10-15', 'cc other business', 5, 'miscellaneous');" >/dev/null
  echo $(( $(date +%s) - start )) > /tmp/.cc_other_$$ ) &
S3=$!
wait $S1; wait $S2; wait $S3
SAME=$(cat /tmp/.cc_same_$$); OTHER=$(cat /tmp/.cc_other_$$); rm -f /tmp/.cc_same_$$ /tmp/.cc_other_$$

bad=$(psql_ -c "select count(*) from (
                  select balance, sum(coalesce(debit,0) - coalesce(credit,0))
                           over (partition by business_id order by entry_date, created_at, id) as expected
                    from public.general_ledger) t
                 where balance is distinct from expected")
latest=$(psql_ -c "select balance from public.general_ledger where business_id = '$A_ID' order by entry_date desc, created_at desc, id desc limit 1")
b_bal=$(psql_ -c "select balance from public.general_ledger where business_id = '$B_ID'")
OTHERS_AFTER=$(psql_ -c "select md5(coalesce(string_agg(id::text || ':' || balance::text, ',' order by id), '')) from public.general_ledger where business_id not in ('$A_ID','$B_ID')")

fail=0
[ "$bad" = "0" ] && [ "$latest" = "78600.00" ] && echo "ok  same-business concurrent append + backdated insert (latest 78600.00)" \
  || { echo "FAIL chain: $bad rows out of chain, latest $latest (want 78600.00)" >&2; fail=1; }
[ "$SAME" -ge 2 ] && echo "ok  same-business writer waited for the business lock (${SAME}s)" \
  || { echo "FAIL same-business writer did not wait (${SAME}s)" >&2; fail=1; }
[ "$OTHER" -le 1 ] && echo "ok  other-business writer did not wait (${OTHER}s)" \
  || { echo "FAIL other-business writer waited ${OTHER}s: lock is not per business" >&2; fail=1; }
[ "$b_bal" = "5.00" ] && echo "ok  other business started its own book at 0 (balance 5.00)" \
  || { echo "FAIL other business balance $b_bal (want 5.00)" >&2; fail=1; }
[ "$OTHERS_BEFORE" = "$OTHERS_AFTER" ] && echo "ok  every other business's stored balances unchanged" \
  || { echo "FAIL other businesses' balances changed" >&2; fail=1; }
exit $fail
