-- Global vendor-category system for accounting classification.
--
-- Ported from feat/vendor-categories (commit d207f91) onto CURRENT main, whose
-- git history carries no prior migrations at all -- production's schema for
-- vendors/general_ledger/vendor_ledger predates any migration file in this
-- repo. This migration is purely additive (new table, new nullable columns,
-- new triggers scoped to these new columns) so it is safe to layer on top of
-- whatever main's production schema already is.
--
-- Separate from vendor_tags, which is untouched. Tags are free-text labels a
-- vendor can have many of; a category is one controlled accounting
-- classification chosen from a globally managed list.
--
-- Unlike d207f91's original, this does NOT depend on a shared
-- update_updated_at_column() trigger function -- that helper does not exist
-- on main (every route on main sets updated_at manually, e.g.
-- src/app/api/vendors/[id]/route.ts). The vendor-categories API routes follow
-- the same manual convention instead of introducing new shared infrastructure.

-- ---------------------------------------------------------------- categories
create table if not exists public.vendor_categories (
  id          uuid primary key default gen_random_uuid(),
  name        varchar(120) not null,
  -- Archive rather than delete. A category that has classified real ledger
  -- entries carries accounting meaning; removing it from the picker must not
  -- require destroying that meaning.
  archived_at timestamptz,
  created_at  timestamptz not null default timezone('utc'::text, now()),
  updated_at  timestamptz not null default timezone('utc'::text, now())
);

-- Unique on the trimmed, case-folded name: "Charity" and "charity " are the
-- same accounting category, and a controlled list that admits both is not
-- controlled.
create unique index if not exists vendor_categories_name_unique
  on public.vendor_categories (lower(btrim(name)));

-- ---------------------------------------------------------------- vendors
-- Nullable: existing vendors stay valid and are never forced into a category.
alter table public.vendors
  add column if not exists category_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'vendors_category_id_fkey'
  ) then
    alter table public.vendors
      add constraint vendors_category_id_fkey
      foreign key (category_id) references public.vendor_categories (id)
      on delete restrict;
  end if;
end $$;

create index if not exists idx_vendors_category_id on public.vendors (category_id);

-- ---------------------------------------------------------------- snapshot
-- The ledger records what the classification WAS when the entry was made.
--
-- Both columns are deliberate. The id supports exact filtering and survives a
-- rename; the name survives the id being archived or the category being renamed
-- afterwards, so a historical report still reads the way the books read at the
-- time. Resolving the category through vendors at read time would silently
-- rewrite history every time a vendor is reclassified -- which is the whole
-- thing this is here to prevent.
alter table public.general_ledger
  add column if not exists vendor_category_id   uuid,
  add column if not exists vendor_category_name varchar(120);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'general_ledger_vendor_category_id_fkey'
  ) then
    alter table public.general_ledger
      add constraint general_ledger_vendor_category_id_fkey
      foreign key (vendor_category_id) references public.vendor_categories (id)
      on delete restrict;
  end if;
end $$;

create index if not exists idx_general_ledger_vendor_category
  on public.general_ledger (vendor_category_id);

-- Snapshot at write time, in the database rather than in a route handler, so
-- every insert path gets it -- including any future one that forgets.
create or replace function public.snapshot_vendor_category()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Only for vendor-linked entries, and only when the caller has not supplied
  -- a snapshot explicitly (which lets a correcting entry restate history).
  if new.vendor_id is not null and new.vendor_category_id is null and new.vendor_category_name is null then
    select vc.id, vc.name
      into new.vendor_category_id, new.vendor_category_name
      from public.vendors v
      join public.vendor_categories vc on vc.id = v.category_id
     where v.id = new.vendor_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_snapshot_vendor_category on public.general_ledger;
create trigger trg_snapshot_vendor_category
  before insert on public.general_ledger
  for each row execute function public.snapshot_vendor_category();

-- ---------------------------------------------------------------- RLS
-- All reads/writes from this app go through API routes using the
-- service-role client (createAdminSupabaseClient), which bypasses RLS
-- entirely -- see src/lib/supabase.ts. This policy is defense in depth for
-- any direct PostgREST access with a signed-in user's session, not something
-- the app itself relies on.
alter table public.vendor_categories enable row level security;

drop policy if exists "Enable read access for authenticated users" on public.vendor_categories;
create policy "Enable read access for authenticated users"
  on public.vendor_categories for select
  using ((auth.role() = 'authenticated'::text));

-- No INSERT/UPDATE/DELETE policies. Writes go through the vendor-categories
-- API routes on the service-role client only.

-- ---------------------------------------------------------------- privileges
revoke all on function public.snapshot_vendor_category() from public, anon, authenticated;

grant select on public.vendor_categories to anon, authenticated;
grant all on public.vendor_categories to service_role;

-- ---------------------------------------------------------------- seed
-- Matches d207f91's original seed exactly (three categories, plural
-- "Owner Withdrawals"). The following migration
-- (20260827000200_vendor_categories_full_list.sql, ported from ca78673)
-- renames the plural and completes the list to the final five. Kept as two
-- steps to mirror the proven, already-tested migration history rather than
-- collapsing it into a single seed of five.
insert into public.vendor_categories (name)
values ('Fixed Expense'), ('Owner Withdrawals'), ('Charity')
on conflict do nothing;

-- ---------------------------------------------------------------- assert
do $$
begin
  if to_regclass('public.vendor_categories') is null then
    raise exception 'vendor_categories was not created';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='vendors' and column_name='category_id') then
    raise exception 'vendors.category_id was not added';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='general_ledger' and column_name='vendor_category_name') then
    raise exception 'general_ledger snapshot columns were not added';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_snapshot_vendor_category') then
    raise exception 'snapshot trigger was not installed';
  end if;
  raise notice 'vendor categories installed';
end $$;
