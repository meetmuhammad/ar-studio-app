-- READ-ONLY. Prints the exact GRANT and CREATE POLICY statements currently in
-- force on the three tables that
-- supabase/migrations/20261024000000_close_role_escalation_and_ledger_direct_access.sql
-- changes. Run it on the target database BEFORE applying that migration and keep
-- the output: replaying it is the rollback. A generic `GRANT ALL` would restore
-- more than was there, and would not restore the policies at all.
--
--   local:  docker exec -i supabase_db_ar-studio-app psql -U postgres -d postgres -tA \
--             < scripts/security/capture-grants.sql > rollback-local.sql
--   hosted: paste into the Supabase SQL editor and save the result.

-- Table-level grants to the client roles.
select format('grant %s on table %s to %s;',
              lower(a.privilege_type), c.oid::regclass, pg_get_userbyid(a.grantee))
  from pg_class c
 cross join lateral aclexplode(c.relacl) a
 where c.oid in ('public.users'::regclass,
                 'public.general_ledger'::regclass,
                 'public.vendor_ledger'::regclass)
   and pg_get_userbyid(a.grantee) in ('anon', 'authenticated')
 order by 1;

-- Column-level grants, if any (none expected; listed so a surprise is visible).
select format('grant %s (%I) on table %s to %s;',
              lower(a.privilege_type), att.attname, att.attrelid::regclass, pg_get_userbyid(a.grantee))
  from pg_attribute att
 cross join lateral aclexplode(att.attacl) a
 where att.attrelid in ('public.users'::regclass,
                        'public.general_ledger'::regclass,
                        'public.vendor_ledger'::regclass)
   and att.attacl is not null
   and pg_get_userbyid(a.grantee) in ('anon', 'authenticated')
 order by 1;

-- Policies, as CREATE POLICY statements.
select format('create policy %I on %s as %s for %s to %s%s%s;',
              p.polname,
              p.polrelid::regclass,
              case when p.polpermissive then 'permissive' else 'restrictive' end,
              case p.polcmd when 'r' then 'select' when 'a' then 'insert'
                            when 'w' then 'update' when 'd' then 'delete' else 'all' end,
              coalesce((select string_agg(case when r = 0 then 'public' else quote_ident(pg_get_userbyid(r)) end, ', ')
                          from unnest(p.polroles) r), 'public'),
              case when p.polqual      is not null then ' using ('      || pg_get_expr(p.polqual,      p.polrelid) || ')' else '' end,
              case when p.polwithcheck is not null then ' with check (' || pg_get_expr(p.polwithcheck, p.polrelid) || ')' else '' end)
  from pg_policy p
 where p.polrelid in ('public.users'::regclass,
                      'public.general_ledger'::regclass,
                      'public.vendor_ledger'::regclass)
 order by 1;
