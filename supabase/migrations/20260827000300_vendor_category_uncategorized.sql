-- "Uncategorized" as a real category row, not NULL.
--
-- The three preceding migrations left vendors.category_id nullable, and a
-- vendor with no category read as an em-dash in the list and "Uncategorised"
-- in the ledger -- a state you could see but never filter on, because the
-- ledger category filter matches general_ledger.vendor_category_id and NULL
-- matches nothing.
--
-- Making it a row instead of a NULL means every vendor has exactly one
-- category, the picker needs no "none" sentinel, the snapshot triggers store
-- it like any other, and "Uncategorized" becomes a selectable filter that
-- actually totals. The id is fixed rather than generated so the same value is
-- valid in local, staging and production, and so app code can reference it
-- without a lookup. gen_random_uuid() cannot produce the all-zero uuid, so it
-- can never collide with a user-created category.

insert into public.vendor_categories (id, name)
values ('00000000-0000-0000-0000-000000000000', 'Uncategorized')
on conflict (id) do nothing;

-- Any vendor that predates the category system, or was created without one.
update public.vendors
   set category_id = '00000000-0000-0000-0000-000000000000',
       updated_at  = timezone('utc'::text, now())
 where category_id is null;

-- Backstop for any insert path that omits category_id. The app sends it
-- explicitly (see src/components/forms/vendor-form.tsx), but a route added
-- later, or a manual insert, should not be able to reintroduce NULL.
alter table public.vendors
  alter column category_id set default '00000000-0000-0000-0000-000000000000';

do $$
begin
  if not exists (select 1 from public.vendor_categories
                  where id = '00000000-0000-0000-0000-000000000000') then
    raise exception 'Uncategorized category was not created';
  end if;
  if exists (select 1 from public.vendors where category_id is null) then
    raise exception 'vendors still carry a null category_id';
  end if;
  raise notice 'uncategorized category installed and backfilled';
end $$;
