-- Re-snapshot the vendor category when a ledger entry's vendor is CHANGED.
--
-- FOUND BY CODE REVIEW, THEN REPRODUCED. 20260818090000 snapshots on INSERT
-- only. `PUT /api/general-ledger/[id]` can change `vendor_id` on an existing
-- row, and the ledger edit dialog sends it, so this is reachable through the
-- shipped UI rather than being theoretical.
--
-- Reproduced: an entry created against a vendor classified "RV Charity", then
-- reassigned to a vendor classified "RV Fixed", still reported
-- vendor_category_name = 'RV Charity' — a category belonging to a vendor the
-- row no longer references. It would be returned by the Charity filter and
-- exported as Charity, attributing the spend to the wrong classification.
--
-- The second bad case: an entry with no vendor, later given one, keeps NULL and
-- reads "Uncategorised" forever.
--
-- THIS IS NOT THE HISTORY-PRESERVING CASE. Those are different events and must
-- behave differently:
--
--   vendor is reclassified          -> entry keeps its snapshot   (history)
--   entry is moved to a new vendor  -> entry re-snapshots         (correction)
--
-- The first is the vendor changing over time, and the books must still read the
-- way they read then. The second is someone fixing which vendor an entry was
-- always about, so the classification must follow. 20260818090000 gets the
-- first right; this gets the second right. The trigger fires only when
-- vendor_id itself changes, so a reclassification still never rewrites history.
--
-- In SQL rather than the route handler, matching the insert path, so the next
-- writer cannot reintroduce the gap.

create or replace function public.resnapshot_vendor_category()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.vendor_id is null then
    new.vendor_category_id := null;
    new.vendor_category_name := null;
  else
    select vc.id, vc.name
      into new.vendor_category_id, new.vendor_category_name
      from public.vendors v
      left join public.vendor_categories vc on vc.id = v.category_id
     where v.id = new.vendor_id;

    -- A vendor with no category clears the snapshot rather than keeping the
    -- previous vendor's.
    if not found then
      new.vendor_category_id := null;
      new.vendor_category_name := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_resnapshot_vendor_category on public.general_ledger;
create trigger trg_resnapshot_vendor_category
  before update on public.general_ledger
  for each row
  when (new.vendor_id is distinct from old.vendor_id)
  execute function public.resnapshot_vendor_category();

revoke all on function public.resnapshot_vendor_category() from public, anon, authenticated;

-- No backfill. Existing rows keep whatever they have; this only governs future
-- vendor changes.

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_resnapshot_vendor_category') then
    raise exception 'resnapshot trigger was not installed';
  end if;
  raise notice 'vendor category re-snapshot on vendor change installed';
end $$;
