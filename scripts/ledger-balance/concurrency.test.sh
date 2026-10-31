#!/usr/bin/env bash
# Two sessions write to general_ledger at once: one appends, one back-dates.
# Without writer serialisation each session recalculates from a snapshot that
# lacks the other's row, and the chain breaks.
#
# MUTATES DATA. Point it only at an empty local test database; it refuses a
# non-empty ledger and deletes the rows it inserted.
#
#   scripts/ledger-balance/concurrency.test.sh <test-db>
set -euo pipefail

DB="${1:?usage: concurrency.test.sh <test-db>}"
psql_() { docker exec -i supabase_db_ar-studio-app psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -qAt "$@"; }

if [ "$(psql_ -c 'select count(*) from public.general_ledger')" != "0" ]; then
  echo "general_ledger is not empty: refusing to run a mutating test here" >&2
  exit 1
fi

psql_ -c "insert into public.general_ledger (entry_date, created_at, particulars, debit, entry_type)
          values ('2026-10-01', '2026-10-01 10:00+05', 'cc opening', 1000, 'opening_balance'),
                 ('2026-10-30', '2026-10-30 10:00+05', 'cc later', 500, 'miscellaneous')"

# Session A holds its transaction open after writing; session B starts while A
# is still uncommitted.
psql_ -c "begin;
          insert into public.general_ledger (entry_date, particulars, debit, entry_type)
          values ('2026-10-31', 'cc append', 100, 'miscellaneous');
          select pg_sleep(2);
          commit;" &
A=$!
sleep 0.5
psql_ -c "set lock_timeout = '10s';
          insert into public.general_ledger (entry_date, particulars, debit, entry_type)
          values ('2026-10-15', 'cc backdated', 77000, 'order_payment');" &
B=$!
wait $A
wait $B

bad=$(psql_ -c "select count(*) from (
                  select balance, sum(coalesce(debit,0) - coalesce(credit,0))
                           over (order by entry_date, created_at, id) as expected
                    from public.general_ledger) t
                 where balance is distinct from expected")
latest=$(psql_ -c "select balance from public.general_ledger order by entry_date desc, created_at desc, id desc limit 1")

psql_ -c "delete from public.general_ledger where particulars like 'cc %'"

if [ "$bad" != "0" ] || [ "$latest" != "78600.00" ]; then
  echo "FAIL concurrent writes: $bad rows out of chain, latest balance $latest (want 78600.00)" >&2
  exit 1
fi
echo "ok  concurrent append + backdated insert (latest 78600.00)"
