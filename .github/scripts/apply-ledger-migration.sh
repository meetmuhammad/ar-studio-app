#!/usr/bin/env bash
#
# Applies supabase/migrations/20260817140000_ledger_balance_integrity.sql to the
# STAGING Supabase project and proves the result, all through the Supabase
# Management API so the runner needs no direct Postgres route.
#
# Reads from the environment (set by the workflow, all masked):
#   REF, SUPABASE_ACCESS_TOKEN, ANON_KEY, SERVICE_KEY
#
# Prints only aggregate numbers. Never prints a secret.
set -euo pipefail

: "${REF:?}"
: "${SUPABASE_ACCESS_TOKEN:?}"
: "${ANON_KEY:?}"
: "${SERVICE_KEY:?}"

MIGRATION_FILE=${MIGRATION_FILE:-supabase/migrations/20260817140000_ledger_balance_integrity.sql}
MIGRATION_VERSION=${MIGRATION_VERSION:-20260817140000}
MIGRATION_NAME=${MIGRATION_NAME:-ledger_balance_integrity}

API="https://api.supabase.com/v1/projects/${REF}/database/query"
REST="https://${REF}.supabase.co"

# Run SQL. Prints the JSON result. Fails the step on any API or SQL error.
q () {
  local sql="$1" out code
  out=$(mktemp)
  code=$(jq -Rs '{query: .}' <<<"$sql" \
    | curl -sS -o "$out" -w '%{http_code}' -X POST "$API" \
        -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
        -H "Content-Type: application/json" \
        --data-binary @-)
  if [ "$code" != "200" ] && [ "$code" != "201" ]; then
    echo "::error::Management API returned HTTP $code"
    cat "$out"; rm -f "$out"; return 1
  fi
  cat "$out"; echo; rm -f "$out"
}

# The integrity report. Two independent measures on purpose:
#   broken_links  - every adjacent pair must satisfy b[i] = b[i-1] + debit - credit
#   mismatches    - every stored balance compared against a running total
#                   recomputed from scratch over (entry_date, created_at, id)
REPORT_SQL=$(cat <<'SQL'
with ord as (
  select gl.id,
         gl.balance,
         coalesce(gl.debit,0) - coalesce(gl.credit,0) as delta,
         lag(gl.balance) over w as prev_bal,
         row_number() over w as rn,
         count(*) over () as n,
         sum(coalesce(gl.debit,0) - coalesce(gl.credit,0)) over (
           order by gl.entry_date, gl.created_at, gl.id
           rows between unbounded preceding and current row
         ) as expected
    from public.general_ledger gl
  window w as (order by gl.entry_date, gl.created_at, gl.id)
)
select json_build_object(
  'rows',            (select count(*) from public.general_ledger),
  'first_balance',   (select balance from ord where rn = 1),
  'last_balance',    (select balance from ord where rn = n),
  'true_net',        (select coalesce(sum(coalesce(debit,0) - coalesce(credit,0)),0) from public.general_ledger),
  'broken_links',    (select count(*) from ord where prev_bal is not null and balance - prev_bal - delta <> 0),
  'total_links',     (select count(*) from ord where prev_bal is not null),
  'mismatches',      (select count(*) from ord where balance is distinct from expected)
) as report;
SQL
)

hr () { printf '\n=============== %s ===============\n' "$1"; }

hr "0. target"
echo "TARGET DATABASE: STAGING - ${REF}"
q "select current_database() as db, current_user as usr, version() as pg;"

hr "1. BEFORE - ledger integrity"
q "$REPORT_SQL"

hr "1a. BEFORE - independent JS recomputation (mismatches expected here)"
ALLOW_MISMATCH=1 node .github/scripts/verify-ledger.mjs

hr "1b. BEFORE - triggers on general_ledger"
q "select tgname, pg_get_triggerdef(oid) as def
     from pg_trigger
    where tgrelid = 'public.general_ledger'::regclass and not tgisinternal
    order by tgname;"

hr "2. APPLY migration ${MIGRATION_VERSION}"
q "$(cat "$MIGRATION_FILE")"

hr "3. record the migration version so a future db push does not re-run it"
q "create schema if not exists supabase_migrations;
   create table if not exists supabase_migrations.schema_migrations (
     version text primary key, statements text[], name text);
   insert into supabase_migrations.schema_migrations (version, name)
   values ('${MIGRATION_VERSION}', '${MIGRATION_NAME}')
   on conflict (version) do nothing;
   select version, name from supabase_migrations.schema_migrations order by version;"

hr "4. AFTER - ledger integrity"
q "$REPORT_SQL"

hr "4b. AFTER - triggers on general_ledger"
q "select tgname, pg_get_triggerdef(oid) as def
     from pg_trigger
    where tgrelid = 'public.general_ledger'::regclass and not tgisinternal
    order by tgname;"

hr "5. INDEPENDENT recomputation in JS (not SQL) over every row"
node .github/scripts/verify-ledger.mjs

hr "6. BACK-DATED INSERT test - insert one row before most of the ledger"
q "insert into public.general_ledger (entry_date, particulars, debit, entry_type, notes)
   values (
     (select min(entry_date) from public.general_ledger) - 1,
     'CI FIXTURE back-dated integrity probe', 500000, 'miscellaneous',
     'ci-fixture-20260817140000'
   )
   returning id, entry_date, debit, balance;"
q "$REPORT_SQL"
node .github/scripts/verify-ledger.mjs

hr "6b. clean the fixture up"
q "delete from public.general_ledger where notes = 'ci-fixture-20260817140000' returning id;"

hr "6c. population restored"
q "$REPORT_SQL"
node .github/scripts/verify-ledger.mjs

hr "7. TIE ORDERING - two rows tying on entry_date AND created_at"
# Inserted highest-id-first, in separate statements, so that if anything were
# ordering by insertion sequence rather than by id the two balances would come
# out swapped. TIE A (id ...a1) must get +100 and TIE B (id ...b2) +200.
q "insert into public.general_ledger (id, entry_date, created_at, particulars, debit, entry_type, notes)
   values ('00000000-0000-4000-8000-0000000000b2'::uuid, date '2000-01-02', timestamptz '2000-01-02 10:00:00+00', 'TIE B', 200, 'miscellaneous', 'ci-tie')
   returning id;"
q "insert into public.general_ledger (id, entry_date, created_at, particulars, debit, entry_type, notes)
   values ('00000000-0000-4000-8000-0000000000a1'::uuid, date '2000-01-02', timestamptz '2000-01-02 10:00:00+00', 'TIE A', 100, 'miscellaneous', 'ci-tie')
   returning id;"
q "select particulars, debit, balance,
          balance - lag(balance) over (order by entry_date, created_at, id) as step_from_previous
     from public.general_ledger
    where entry_date <= date '2000-01-02'
    order by entry_date, created_at, id;"
node .github/scripts/verify-ledger.mjs

hr "7b. remove the tie fixtures"
q "delete from public.general_ledger where notes = 'ci-tie' returning id;"
q "select count(*) as tie_fixtures_left from public.general_ledger where notes = 'ci-tie';"
q "$REPORT_SQL"
node .github/scripts/verify-ledger.mjs

hr "8. anon must NOT be able to call the new functions over PostgREST"
for fn in rebuild_general_ledger_balances recalculate_ledger_balances_from \
          calculate_general_ledger_balance recalc_ledger_balances_after_insert \
          recalc_ledger_balances_after_update recalc_ledger_balances_after_delete; do
  code=$(curl -sS -o /tmp/anon.out -w '%{http_code}' -X POST "${REST}/rest/v1/rpc/${fn}" \
    -H "apikey: ${ANON_KEY}" -H "Authorization: Bearer ${ANON_KEY}" \
    -H "Content-Type: application/json" -d '{}')
  echo "anon POST /rest/v1/rpc/${fn} -> HTTP ${code} : $(head -c 160 /tmp/anon.out)"
  if [ "$code" = "200" ] || [ "$code" = "204" ]; then
    echo "::error::anon can call ${fn}"; exit 1
  fi
done

hr "9. FINAL ASSERTION"
final=$(q "select count(*) as mismatches from (
             select gl.balance,
                    sum(coalesce(gl.debit,0) - coalesce(gl.credit,0)) over (
                      order by gl.entry_date, gl.created_at, gl.id
                      rows between unbounded preceding and current row) as expected
               from public.general_ledger gl) t
            where t.balance is distinct from t.expected;")
echo "$final"
bad=$(jq -r '.[0].mismatches // .result[0].mismatches // empty' <<<"$final" 2>/dev/null || true)
if [ -z "$bad" ]; then
  echo "::error::could not read the final mismatch count from the API response"
  exit 1
fi
if [ "$bad" != "0" ]; then
  echo "::error::${bad} stored balances still disagree with the recomputed running total"
  exit 1
fi
echo "FINAL: 0 mismatches across all general_ledger rows."

echo
echo "DONE - staging ${REF}"
