-- Read-only verification for 20261119000000_role_scoped_rls.sql.
-- Lists, per table/view in public: RLS enabled/forced, the privileges held by
-- anon and authenticated, and every policy with its command, roles and
-- expressions. Changes nothing; safe to run in any environment.

with rels as (
  select c.oid, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p', 'v', 'm')
),
privs as (
  select r.relname,
         g.grantee,
         string_agg(g.privilege_type, ', ' order by g.privilege_type) as privileges
    from rels r
    join information_schema.role_table_grants g
      on g.table_schema = 'public' and g.table_name = r.relname
   where g.grantee in ('anon', 'authenticated')
   group by r.relname, g.grantee
),
pols as (
  select p.tablename as relname,
         string_agg(
           format('%s [%s] to %s | using: %s | check: %s',
                  p.policyname, p.cmd, array_to_string(p.roles, ','),
                  coalesce(p.qual, '-'), coalesce(p.with_check, '-')),
           E'\n' order by p.cmd, p.policyname) as policies
    from pg_policies p
   where p.schemaname = 'public'
   group by p.tablename
)
select r.relname                                   as "table",
       case r.relkind when 'v' then 'view' when 'm' then 'matview' else 'table' end as kind,
       r.relrowsecurity                            as rls_enabled,
       r.relforcerowsecurity                       as rls_forced,
       coalesce(a.privileges, '(none)')            as anon_privileges,
       coalesce(au.privileges, '(none)')           as authenticated_privileges,
       coalesce(pl.policies, '(no policies)')      as policies
  from rels r
  left join privs a  on a.relname  = r.relname and a.grantee  = 'anon'
  left join privs au on au.relname = r.relname and au.grantee = 'authenticated'
  left join pols pl  on pl.relname = r.relname
 order by r.relname;

-- Helper function and its execute grants.
select p.proname,
       p.prosecdef                                             as security_definer,
       p.provolatile                                           as volatility,
       has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('current_user_is_admin', 'current_user_business_ids');

-- Default privileges for new tables created by postgres in public.
select pg_get_userbyid(d.defaclrole) as owner,
       d.defaclobjtype                 as object_type,
       d.defaclacl                     as default_acl
  from pg_default_acl d
  join pg_namespace n on n.oid = d.defaclnamespace
 where n.nspname = 'public';
