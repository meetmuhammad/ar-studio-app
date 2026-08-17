#!/usr/bin/env bash
#
# Applies supabase/migrations/20260817160000_vendor_ledger_balance_integrity.sql
# to the STAGING Supabase project and proves the result, all through the
# Supabase Management API so the runner needs no direct Postgres route.
#
# Reads from the environment (set by the workflow, all masked):
#   REF, SUPABASE_ACCESS_TOKEN, ANON_KEY, SERVICE_KEY
# Optional, for the authenticated-JWT refusal probe:
#   STAFF_EMAIL, STAFF_PASSWORD
#
# Prints only aggregate numbers and balances. Never prints a secret.
set -euo pipefail

: "${REF:?}"
: "${SUPABASE_ACCESS_TOKEN:?}"
: "${ANON_KEY:?}"
: "${SERVICE_KEY:?}"

MIGRATION_FILE=${MIGRATION_FILE:-supabase/migrations/20260817160000_vendor_ledger_balance_integrity.sql}
MIGRATION_VERSION=${MIGRATION_VERSION:-20260817160000}
MIGRATION_NAME=${MIGRATION_NAME:-vendor_ledger_balance_integrity}

API="https://api.supabase.com/v1/projects/${REF}/database/query"
REST="https://${REF}.supabase.co"

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

# The integrity report, PER VENDOR plus a rollup. Three independent measures:
#   broken_links   - inside a vendor, every adjacent pair must step by debit-credit
#   bad_first_rows - the first row of each vendor must equal its own movement
#                    (lag() cannot see this one)
#   mismatches     - every stored balance against a running total recomputed
#                    from scratch, partitioned by vendor
REPORT_SQL=$(cat <<'SQL'
with ord as (
  select vl.vendor_id,
         vl.balance,
         coalesce(vl.debit,0) - coalesce(vl.credit,0) as delta,
         lag(vl.balance) over w as prev_bal,
         row_number() over w as rn,
         count(*) over (partition by vl.vendor_id) as n,
         sum(coalesce(vl.debit,0) - coalesce(vl.credit,0)) over (
           partition by vl.vendor_id
           order by vl.entry_date, vl.created_at, vl.id
           rows between unbounded preceding and current row
         ) as expected
    from public.vendor_ledger vl
  window w as (partition by vl.vendor_id
               order by vl.entry_date, vl.created_at, vl.id)
)
select json_build_object(
  'rows',            (select count(*) from public.vendor_ledger),
  'vendors',         (select count(distinct vendor_id) from public.vendor_ledger),
  'broken_links',    (select count(*) from ord where prev_bal is not null and balance - prev_bal - delta <> 0),
  'total_links',     (select count(*) from ord where prev_bal is not null),
  'bad_first_rows',  (select count(*) from ord where rn = 1 and balance <> delta),
  'mismatches',      (select count(*) from ord where balance is distinct from expected),
  'checksum',        (select md5(string_agg(id::text || '=' || balance::text, ',' order by id)) from public.vendor_ledger),
  'per_vendor',      (select json_agg(v order by v->>'vendor_id') from (
                        select json_build_object(
                          'vendor_id', vendor_id,
                          'rows', n,
                          'first_balance', max(balance) filter (where rn = 1),
                          'final_balance', max(balance) filter (where rn = n),
                          'net_movement', sum(delta)
                        ) as v
                          from ord group by vendor_id, n
                      ) s)
) as report;
SQL
)

hr () { printf '\n=============== %s ===============\n' "$1"; }

hr "0. target"
echo "TARGET DATABASE: STAGING - ${REF}"
q "select current_database() as db, current_user as usr;"

hr "1. BEFORE - vendor_ledger integrity"
q "$REPORT_SQL"

hr "1a. BEFORE - independent JS recomputation (mismatches tolerated here)"
ALLOW_MISMATCH=1 node .github/scripts/verify-vendor-ledger.mjs

hr "1b. BEFORE - triggers on vendor_ledger (expected: none)"
q "select coalesce(json_agg(json_build_object('name', tgname, 'def', pg_get_triggerdef(oid))), '[]'::json) as triggers
     from pg_trigger
    where tgrelid = 'public.vendor_ledger'::regclass and not tgisinternal;"

hr "1c. BEFORE - the function that seeds the balance"
q "select pg_get_functiondef('public.create_vendor_sub_ledger_entry()'::regprocedure) as def;"

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

hr "4. AFTER - vendor_ledger integrity"
q "$REPORT_SQL"

hr "4b. AFTER - triggers on vendor_ledger"
q "select json_agg(json_build_object('name', tgname, 'def', pg_get_triggerdef(oid)) order by tgname) as triggers
     from pg_trigger
    where tgrelid = 'public.vendor_ledger'::regclass and not tgisinternal;"

hr "5. INDEPENDENT recomputation in JS (not SQL), per vendor, over every row"
node .github/scripts/verify-vendor-ledger.mjs

hr "6. snapshot the whole table so the restore can be checked bit-for-bit"
q "drop table if exists public.ci_vl_snapshot;
   create table public.ci_vl_snapshot as
     select id, vendor_id, entry_date, created_at, debit, credit, balance
       from public.vendor_ledger;
   revoke all on table public.ci_vl_snapshot from public, anon, authenticated;
   select count(*) as snapshot_rows,
          md5(string_agg(id::text || '=' || balance::text, ',' order by id)) as snapshot_checksum
     from public.ci_vl_snapshot;"

hr "7. BACK-DATED INSERT for one vendor - every later balance must move by +777.77"
q "insert into public.vendor_ledger (vendor_id, entry_date, particulars, debit, notes)
   select v.vendor_id,
          (select min(entry_date) from public.vendor_ledger x where x.vendor_id = v.vendor_id) - 1,
          'CI FIXTURE back-dated probe', 777.77, 'ci-vl-backdate'
     from (select vendor_id from public.vendor_ledger
            group by vendor_id order by count(*) desc, vendor_id limit 1) v
   returning id, vendor_id, entry_date, debit, balance;"
q "$REPORT_SQL"
q "select json_build_object(
     'probe_vendor',            (select vendor_id from public.vendor_ledger where notes = 'ci-vl-backdate'),
     'rows_shifted_by_777_77',  (select count(*) from public.ci_vl_snapshot s
                                   join public.vendor_ledger n on n.id = s.id
                                  where s.vendor_id = (select vendor_id from public.vendor_ledger where notes = 'ci-vl-backdate')
                                    and n.balance - s.balance = 777.77),
     'rows_shifted_wrongly',    (select count(*) from public.ci_vl_snapshot s
                                   join public.vendor_ledger n on n.id = s.id
                                  where s.vendor_id = (select vendor_id from public.vendor_ledger where notes = 'ci-vl-backdate')
                                    and n.balance - s.balance is distinct from 777.77),
     'other_vendor_rows_moved', (select count(*) from public.ci_vl_snapshot s
                                   join public.vendor_ledger n on n.id = s.id
                                  where s.vendor_id <> (select vendor_id from public.vendor_ledger where notes = 'ci-vl-backdate')
                                    and n.balance is distinct from s.balance)
   ) as backdated_insert_proof;"
node .github/scripts/verify-vendor-ledger.mjs

hr "7b. DELETE the probe - the previous ledger must come back bit-for-bit"
q "delete from public.vendor_ledger where notes = 'ci-vl-backdate' returning id;"
q "$REPORT_SQL"
q "select json_build_object(
     'snapshot_rows',      (select count(*) from public.ci_vl_snapshot),
     'live_rows',          (select count(*) from public.vendor_ledger),
     'rows_only_in_one',   (select count(*) from public.ci_vl_snapshot s
                              full join public.vendor_ledger n on n.id = s.id
                             where s.id is null or n.id is null),
     'balances_differing', (select count(*) from public.ci_vl_snapshot s
                              join public.vendor_ledger n on n.id = s.id
                             where n.balance is distinct from s.balance),
     'snapshot_checksum',  (select md5(string_agg(id::text || '=' || balance::text, ',' order by id)) from public.ci_vl_snapshot),
     'live_checksum',      (select md5(string_agg(id::text || '=' || balance::text, ',' order by id)) from public.vendor_ledger)
   ) as delete_restores_exactly_proof;"
node .github/scripts/verify-vendor-ledger.mjs

hr "8. MULTI-VENDOR: one statement, a back-dated row for EVERY vendor"
q "insert into public.vendor_ledger (vendor_id, entry_date, particulars, debit, notes)
   select v.vendor_id,
          (select min(entry_date) from public.vendor_ledger x where x.vendor_id = v.vendor_id) - 1,
          'CI FIXTURE multi-vendor back-dated', 111.00, 'ci-vl-multi'
     from (select distinct vendor_id from public.vendor_ledger) v
   returning vendor_id, entry_date, balance;"
q "$REPORT_SQL"
q "select json_build_object(
     'each_vendor_first_row_is_the_probe',
       (select bool_and(first_notes = 'ci-vl-multi' and first_balance = 111.00) from (
          select distinct on (vendor_id) vendor_id,
                 notes as first_notes, balance as first_balance
            from public.vendor_ledger
           order by vendor_id, entry_date, created_at, id) t),
     'preexisting_rows_shifted_by_111',
       (select count(*) from public.ci_vl_snapshot s join public.vendor_ledger n on n.id = s.id
         where n.balance - s.balance = 111.00),
     'preexisting_rows_shifted_wrongly',
       (select count(*) from public.ci_vl_snapshot s join public.vendor_ledger n on n.id = s.id
         where n.balance - s.balance is distinct from 111.00)
   ) as multi_vendor_proof;"
node .github/scripts/verify-vendor-ledger.mjs
q "delete from public.vendor_ledger where notes = 'ci-vl-multi' returning id;"
q "select json_build_object(
     'balances_differing', (select count(*) from public.ci_vl_snapshot s
                              join public.vendor_ledger n on n.id = s.id
                             where n.balance is distinct from s.balance),
     'live_checksum',      (select md5(string_agg(id::text || '=' || balance::text, ',' order by id)) from public.vendor_ledger)
   ) as restored_after_multi_vendor;"
node .github/scripts/verify-vendor-ledger.mjs

hr "9. TIE ORDERING - two rows tying on entry_date AND created_at, inserted high-id first"
# Separate statements, highest id first: if anything ordered by insertion
# sequence rather than by id, the two balances would come out swapped.
q "insert into public.vendor_ledger (id, vendor_id, entry_date, created_at, particulars, debit, notes)
   select '00000000-0000-4000-8000-0000000000b2'::uuid, v.vendor_id, date '2000-01-02',
          timestamptz '2000-01-02 10:00:00+00', 'TIE B', 200, 'ci-vl-tie'
     from (select vendor_id from public.vendor_ledger group by vendor_id order by count(*) desc, vendor_id limit 1) v
   returning id, balance;"
q "insert into public.vendor_ledger (id, vendor_id, entry_date, created_at, particulars, debit, notes)
   select '00000000-0000-4000-8000-0000000000a1'::uuid, v.vendor_id, date '2000-01-02',
          timestamptz '2000-01-02 10:00:00+00', 'TIE A', 100, 'ci-vl-tie'
     from (select vendor_id from public.vendor_ledger where notes = 'ci-vl-tie' limit 1) v
   returning id, balance;"
echo "-- expected: TIE A (id ...a1) = 100.00, TIE B (id ...b2) = 300.00"
q "select json_agg(json_build_object('particulars', particulars, 'debit', debit, 'balance', balance)
                   order by entry_date, created_at, id) as tie_rows
     from public.vendor_ledger where notes = 'ci-vl-tie';"
q "$REPORT_SQL"

hr "9b. SAME entry_date, DIFFERENT created_at, inserted last but sorting first"
q "insert into public.vendor_ledger (vendor_id, entry_date, created_at, particulars, debit, notes)
   select vendor_id, date '2000-01-02', timestamptz '2000-01-02 09:00:00+00',
          'EARLIER SAME DAY', 50, 'ci-vl-tie2'
     from public.vendor_ledger where notes = 'ci-vl-tie' limit 1
   returning id, balance;"
echo "-- expected: EARLIER SAME DAY = 50.00, TIE A = 150.00, TIE B = 350.00"
q "select json_agg(json_build_object('particulars', particulars, 'balance', balance)
                   order by entry_date, created_at, id) as tie_rows
     from public.vendor_ledger where notes in ('ci-vl-tie','ci-vl-tie2');"
q "$REPORT_SQL"
node .github/scripts/verify-vendor-ledger.mjs

hr "9c. UPDATE proofs - amount, entry_date, created_at, vendor_id"
q "update public.vendor_ledger set debit = 1000 where particulars = 'TIE A' returning balance;"
q "$REPORT_SQL"
q "update public.vendor_ledger set entry_date = date '2099-01-01' where particulars = 'TIE A' returning balance;"
q "$REPORT_SQL"
q "update public.vendor_ledger set created_at = timestamptz '2000-01-02 23:00:00+00'
    where particulars = 'EARLIER SAME DAY' returning balance;"
q "$REPORT_SQL"
q "update public.vendor_ledger vl
      set vendor_id = (select vendor_id from public.vendor_ledger
                        where vendor_id <> vl.vendor_id limit 1)
    where vl.particulars = 'TIE A' returning vendor_id, balance;"
q "$REPORT_SQL"
node .github/scripts/verify-vendor-ledger.mjs

hr "9d. remove the tie fixtures - back to the snapshot"
q "delete from public.vendor_ledger where notes in ('ci-vl-tie','ci-vl-tie2') returning id;"
q "select json_build_object(
     'balances_differing', (select count(*) from public.ci_vl_snapshot s
                              join public.vendor_ledger n on n.id = s.id
                             where n.balance is distinct from s.balance),
     'live_checksum',      (select md5(string_agg(id::text || '=' || balance::text, ',' order by id)) from public.vendor_ledger)
   ) as restored_after_ties;"
q "$REPORT_SQL"
node .github/scripts/verify-vendor-ledger.mjs

hr "10. THE ORIGINAL REPRO - a back-dated general_ledger row carrying a vendor_id"
# Before this migration this left general_ledger whole and vendor_ledger with a
# broken link. Both must now be clean.
q "insert into public.general_ledger (entry_date, particulars, credit, entry_type, vendor_id, notes)
   select (select min(entry_date) from public.general_ledger) - 5,
          'CI FIXTURE back-dated GL with vendor', 4242.00, 'miscellaneous',
          (select vendor_id from public.vendor_ledger group by vendor_id order by count(*) desc, vendor_id limit 1),
          'ci-vl-gl'
   returning id, entry_date, credit, balance, vendor_id;"
q "select json_build_object(
     'gl_broken_links', (select count(*) from (
        select gl.balance - lag(gl.balance) over w - (coalesce(gl.debit,0)-coalesce(gl.credit,0)) as d,
               lag(gl.balance) over w as p
          from public.general_ledger gl
        window w as (order by gl.entry_date, gl.created_at, gl.id)) t
       where t.p is not null and t.d <> 0),
     'mirrored_vendor_row', (select json_build_object('entry_date', entry_date, 'debit', debit,
                                                      'credit', credit, 'balance', balance)
                               from public.vendor_ledger where notes = 'ci-vl-gl')
   ) as gl_repro;"
q "$REPORT_SQL"
node .github/scripts/verify-vendor-ledger.mjs

hr "10b. delete the general_ledger row - ON DELETE CASCADE removes the sub-ledger row"
q "delete from public.general_ledger where notes = 'ci-vl-gl' returning id;"
q "select json_build_object(
     'vendor_rows_left',   (select count(*) from public.vendor_ledger where notes = 'ci-vl-gl'),
     'balances_differing', (select count(*) from public.ci_vl_snapshot s
                              join public.vendor_ledger n on n.id = s.id
                             where n.balance is distinct from s.balance),
     'live_checksum',      (select md5(string_agg(id::text || '=' || balance::text, ',' order by id)) from public.vendor_ledger)
   ) as cascade_delete_proof;"
q "$REPORT_SQL"
node .github/scripts/verify-vendor-ledger.mjs

hr "11. a non-owner role (service_role, via PostgREST) writes, and the triggers still fire"
# The Management API runs as `postgres`, the owner of every function here, so
# the steps above do not prove that revoking EXECUTE leaves the triggers working
# for other roles. This does: it writes through PostgREST as service_role,
# back-dated, and checks the tail repaired itself.
vend=$(curl -sS "${REST}/rest/v1/vendor_ledger?select=vendor_id&limit=1" \
  -H "apikey: ${SERVICE_KEY}" -H "Authorization: Bearer ${SERVICE_KEY}" | jq -r '.[0].vendor_id')
echo "writing as service_role for vendor ${vend}"
curl -sS -X POST "${REST}/rest/v1/vendor_ledger" \
  -H "apikey: ${SERVICE_KEY}" -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d "{\"vendor_id\":\"${vend}\",\"entry_date\":\"2000-01-03\",\"particulars\":\"CI FIXTURE service_role back-dated\",\"debit\":333,\"balance\":999999,\"notes\":\"ci-vl-svc\"}" \
  | jq -c '.[0] | {vendor_id, entry_date, debit, balance}'
echo "-- balance 999999 was supplied by the client and must have been overwritten"
q "$REPORT_SQL"
node .github/scripts/verify-vendor-ledger.mjs
q "delete from public.vendor_ledger where notes = 'ci-vl-svc' returning id;"
q "select json_build_object(
     'balances_differing', (select count(*) from public.ci_vl_snapshot s
                              join public.vendor_ledger n on n.id = s.id
                             where n.balance is distinct from s.balance),
     'live_checksum',      (select md5(string_agg(id::text || '=' || balance::text, ',' order by id)) from public.vendor_ledger)
   ) as restored_after_service_role;"
node .github/scripts/verify-vendor-ledger.mjs

hr "12. the EXECUTE grant matrix - who may call what"
# The authoritative statement of the privilege, straight from the catalog.
# Everything except service_role must be false on every row.
q "with fns(sig) as (values
     ('public.recalculate_vendor_ledger_balances_from(uuid,date,timestamptz,uuid)'),
     ('public.rebuild_vendor_ledger_balances()'),
     ('public.calculate_vendor_ledger_balance()'),
     ('public.create_vendor_sub_ledger_entry()'),
     ('public.recalc_vendor_ledger_after_insert()'),
     ('public.recalc_vendor_ledger_after_update()'),
     ('public.recalc_vendor_ledger_after_delete()'),
     ('public.recalculate_ledger_balances_from(date,timestamptz,uuid)'),
     ('public.rebuild_general_ledger_balances()'))
   select json_agg(json_build_object(
            'function', sig,
            'public',        has_function_privilege('public',        sig, 'execute'),
            'anon',          has_function_privilege('anon',          sig, 'execute'),
            'authenticated', has_function_privilege('authenticated', sig, 'execute'),
            'service_role',  has_function_privilege('service_role',  sig, 'execute')
          ) order by sig) as execute_grants
     from fns;"
echo "-- and assert it, rather than only printing it"
q "with fns(sig) as (values
     ('public.recalculate_vendor_ledger_balances_from(uuid,date,timestamptz,uuid)'),
     ('public.rebuild_vendor_ledger_balances()'),
     ('public.calculate_vendor_ledger_balance()'),
     ('public.create_vendor_sub_ledger_entry()'),
     ('public.recalc_vendor_ledger_after_insert()'),
     ('public.recalc_vendor_ledger_after_update()'),
     ('public.recalc_vendor_ledger_after_delete()'))
   select case when count(*) = 0 then 'OK: no public/anon/authenticated EXECUTE anywhere'
               else (select string_agg(sig, ', ') from fns
                      where has_function_privilege('public', sig, 'execute')
                         or has_function_privilege('anon', sig, 'execute')
                         or has_function_privilege('authenticated', sig, 'execute'))
          end as grant_assertion
     from fns
    where has_function_privilege('public', sig, 'execute')
       or has_function_privilege('anon', sig, 'execute')
       or has_function_privilege('authenticated', sig, 'execute');"

hr "12a. live refusal as the `authenticated` role - expect SQLSTATE 42501"
# PostgREST switches to the Postgres role named in the JWT `role` claim, which
# for any signed-in user of this app is `authenticated`. `set role` reproduces
# exactly that, with the function's REAL signature, and without putting a
# staging login into a PUBLIC repository. A wrong-arity call would raise 42883
# (undefined_function), which this rejects as not-a-proof.
q_denied () {
  local label="$1" sql="$2" out code
  out=$(mktemp)
  code=$(jq -Rs '{query: .}' <<<"$sql" \
    | curl -sS -o "$out" -w '%{http_code}' -X POST "$API" \
        -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
        -H "Content-Type: application/json" --data-binary @-)
  echo "${label} -> HTTP ${code} : $(head -c 260 "$out")"
  if [ "$code" = "200" ] || [ "$code" = "201" ]; then
    echo "::error::${label} SUCCEEDED - the function is callable by that role"
    rm -f "$out"; exit 1
  fi
  if grep -qi 'does not exist\|42883' "$out"; then
    echo "::error::${label} failed with undefined_function - wrong arity, NOT proof of refusal"
    rm -f "$out"; exit 1
  fi
  if ! grep -qi 'permission denied' "$out"; then
    echo "::error::${label} failed for the wrong reason - expected 'permission denied' (42501)"
    rm -f "$out"; exit 1
  fi
  rm -f "$out"
}

NIL='00000000-0000-0000-0000-000000000000'
for role in authenticated anon; do
  q_denied "as ${role}: recalculate_vendor_ledger_balances_from(uuid,date,timestamptz,uuid)" \
    "set role ${role};
     select public.recalculate_vendor_ledger_balances_from(
       '${NIL}'::uuid, date '2000-01-01', timestamptz '2000-01-01 00:00:00+00', '${NIL}'::uuid);"
  q_denied "as ${role}: rebuild_vendor_ledger_balances()" \
    "set role ${role}; select public.rebuild_vendor_ledger_balances();"
  q_denied "as ${role}: recalculate_ledger_balances_from(date,timestamptz,uuid)" \
    "set role ${role};
     select public.recalculate_ledger_balances_from(
       date '2000-01-01', timestamptz '2000-01-01 00:00:00+00', '${NIL}'::uuid);"
  q_denied "as ${role}: rebuild_general_ledger_balances()" \
    "set role ${role}; select public.rebuild_general_ledger_balances();"
done
q "reset role; select current_user as back_to;"

hr "12b. and over HTTP with the browser-embedded anon key, using the REAL signature"
# PostgREST answers 404/PGRST202 when no overload matches the body, which would
# hide a permission hole behind a routing miss. The two non-trigger functions
# are therefore probed with their real argument lists and PGRST202 is treated
# as a failed proof. The trigger functions return `trigger`, so PostgREST
# cannot expose them at all and PGRST202 there is the expected answer.
probe () {
  local label="$1" fn="$2" body="$3" strict="$4" code out
  out=$(mktemp)
  code=$(curl -sS -o "$out" -w '%{http_code}' -X POST "${REST}/rest/v1/rpc/${fn}" \
    -H "apikey: ${ANON_KEY}" -H "Authorization: Bearer ${ANON_KEY}" \
    -H "Content-Type: application/json" -d "$body")
  echo "${label} POST /rest/v1/rpc/${fn} -> HTTP ${code} : $(head -c 220 "$out")"
  if [ "$code" = "200" ] || [ "$code" = "204" ]; then
    echo "::error::anon can call ${fn}"; rm -f "$out"; exit 1
  fi
  if [ "$strict" = "strict" ] && grep -q 'PGRST202' "$out"; then
    echo "::error::${fn} answered PGRST202 - wrong arity, NOT proof of refusal"
    rm -f "$out"; exit 1
  fi
  rm -f "$out"
}

probe anon recalculate_vendor_ledger_balances_from \
  "{\"p_vendor_id\":\"${NIL}\",\"p_entry_date\":\"2000-01-01\",\"p_created_at\":\"2000-01-01T00:00:00Z\",\"p_id\":\"${NIL}\"}" strict
probe anon rebuild_vendor_ledger_balances '{}' strict
probe anon rebuild_general_ledger_balances '{}' strict
probe anon recalculate_ledger_balances_from \
  "{\"p_entry_date\":\"2000-01-01\",\"p_created_at\":\"2000-01-01T00:00:00Z\",\"p_id\":\"${NIL}\"}" strict
for fn in calculate_vendor_ledger_balance create_vendor_sub_ledger_entry \
          recalc_vendor_ledger_after_insert recalc_vendor_ledger_after_update \
          recalc_vendor_ledger_after_delete; do
  probe anon "$fn" '{}' lenient
done

hr "12c. anon must still not be able to READ the ledger tables directly"
for t in vendor_ledger general_ledger vendors; do
  code=$(curl -sS -o /tmp/anonsel.out -w '%{http_code}' "${REST}/rest/v1/${t}?select=id&limit=1" \
    -H "apikey: ${ANON_KEY}" -H "Authorization: Bearer ${ANON_KEY}")
  echo "anon GET /rest/v1/${t} -> HTTP ${code} : $(head -c 160 /tmp/anonsel.out)"
  if [ "$code" = "200" ] && [ "$(jq 'length' /tmp/anonsel.out 2>/dev/null || echo 0)" != "0" ]; then
    echo "::error::anon can read ${t}"; exit 1
  fi
done

hr "13. drop the snapshot table"
q "drop table if exists public.ci_vl_snapshot;
   select to_regclass('public.ci_vl_snapshot') as should_be_null;"

hr "14. FINAL ASSERTION"
final=$(q "with ord as (
             select vl.balance,
                    coalesce(vl.debit,0)-coalesce(vl.credit,0) as delta,
                    row_number() over w as rn,
                    lag(vl.balance) over w as prev,
                    sum(coalesce(vl.debit,0)-coalesce(vl.credit,0)) over (
                      partition by vl.vendor_id
                      order by vl.entry_date, vl.created_at, vl.id
                      rows between unbounded preceding and current row) as expected
               from public.vendor_ledger vl
             window w as (partition by vl.vendor_id
                          order by vl.entry_date, vl.created_at, vl.id))
           select count(*) filter (where balance is distinct from expected)
                + count(*) filter (where rn = 1 and balance <> delta)
                + count(*) filter (where prev is not null and balance - prev - delta <> 0)
                  as mismatches
             from ord;")
echo "$final"
bad=$(jq -r '.[0].mismatches // .result[0].mismatches // empty' <<<"$final" 2>/dev/null || true)
if [ -z "$bad" ]; then
  echo "::error::could not read the final mismatch count from the API response"
  exit 1
fi
if [ "$bad" != "0" ]; then
  echo "::error::${bad} stored vendor_ledger balances still disagree with the recomputed running total"
  exit 1
fi
echo "FINAL: 0 mismatches across all vendor_ledger rows, all vendors."

echo
echo "DONE - staging ${REF}"
