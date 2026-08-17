-- The complete vendor category list, per the owner.
--
--   Fixed Expense
--   Purchases            (new)
--   Owner Withdrawal     (renamed from the seeded plural "Owner Withdrawals")
--   Charity
--   Employees            (new)
--
-- 20260818090000 seeded only three, and used the plural "Owner Withdrawals".
--
-- The rename is by UPDATE, not delete-and-recreate. The id is what vendors
-- reference, so preserving it keeps any classification attached to it; and
-- deleting would be refused by the ON DELETE RESTRICT foreign keys once
-- anything used it. Verified before writing this: on staging that category had
-- 0 vendors and 0 ledger rows, so the rename is a no-op for existing data --
-- but the UPDATE form is correct regardless of that, which the delete form
-- would not be.
--
-- Ledger snapshots are deliberately NOT touched. An entry written while the
-- category read "Owner Withdrawals" keeps that text, because the snapshot
-- records what the books said at the time. That is the whole point of storing
-- the name alongside the id, and it is why a rename is safe.
--
-- Idempotent: the rename only fires if the old name is still present, and the
-- inserts skip anything already there. The unique index is on
-- lower(btrim(name)), so re-running cannot create duplicates.

update public.vendor_categories
   set name = 'Owner Withdrawal'
 where lower(btrim(name)) = 'owner withdrawals'
   and not exists (
     select 1 from public.vendor_categories
      where lower(btrim(name)) = 'owner withdrawal'
   );

insert into public.vendor_categories (name)
select v.name
  from (values ('Fixed Expense'), ('Purchases'), ('Owner Withdrawal'), ('Charity'), ('Employees')) as v(name)
 where not exists (
   select 1 from public.vendor_categories c
    where lower(btrim(c.name)) = lower(btrim(v.name))
 );

do $$
declare
  v_missing text;
begin
  select string_agg(v.name, ', ') into v_missing
    from (values ('Fixed Expense'), ('Purchases'), ('Owner Withdrawal'), ('Charity'), ('Employees')) as v(name)
   where not exists (
     select 1 from public.vendor_categories c
      where lower(btrim(c.name)) = lower(btrim(v.name))
   );

  if v_missing is not null then
    raise exception 'vendor categories missing after seed: %', v_missing;
  end if;

  if exists (select 1 from public.vendor_categories where lower(btrim(name)) = 'owner withdrawals') then
    raise exception 'the plural "Owner Withdrawals" is still present';
  end if;

  raise notice 'vendor category list complete';
end $$;
