-- Atomic, admin-only writes for manual (general) ledger entries, vendor bills
-- and the order-payment sync, plus a read of one vendor's sub-ledger.
--
-- WHY
-- ---
-- general_ledger and vendor_ledger have no client grants by design
-- (20261024000000_close_role_escalation_and_ledger_direct_access.sql). Until
-- now the app wrote them only through /api/general-ledger (+ [id],
-- sync-payments) and /api/vendor-ledger with the service role, in several
-- separate statements. These SECURITY DEFINER functions do the same writes in
-- one transaction each, for admins of the entry's business only.
--
-- WHAT EACH FUNCTION MIRRORS
-- --------------------------
--   create_ledger_entry(p_business_id, p_entry)   POST   /api/general-ledger
--   update_ledger_entry(p_entry_id, p_entry)      PUT    /api/general-ledger/[id]
--   delete_ledger_entry(p_entry_id)               DELETE /api/general-ledger/[id]
--   record_vendor_bill(p_vendor_id, p_bill)       POST   /api/vendor-ledger
--   update_vendor_bill(p_bill_id, p_bill)         (new: the API had no bill edit)
--   delete_vendor_bill(p_bill_id)                 (new: the API had no bill delete)
--   sync_order_payment_ledger(p_business_id)      POST   /api/general-ledger/sync-payments
--   vendor_ledger_entries(p_vendor_id)            GET    /api/vendor-ledger?vendor_id=
--
-- Business rules kept from the routes and the old forms:
--   - an entry has entry_date, particulars and entry_type, and exactly one of
--     debit / credit (0 counts as absent, as `debit || null` did);
--   - a linked vendor (and tag) must belong to the entry's business;
--   - a general-ledger row with a vendor has ONE mirror row in vendor_ledger
--     with debit and credit swapped (GL credit = money paid to the vendor =
--     vendor debit). The existing AFTER INSERT trigger
--     (create_vendor_sub_ledger_entry) writes it on insert; on update the
--     mirror is deleted and rewritten, as the PUT route did;
--   - deleting a general-ledger row deletes its mirror first;
--   - a vendor bill is a vendor_ledger row with no general-ledger row
--     (general_ledger_id null); the old form always sent it as a credit;
--   - vendor payments default their particulars to the vendor's name (the old
--     form filled it in) and require a vendor;
--   - sync deletes the business's order_payment rows and rebuilds them from
--     orders.advance_paid (> 0) and payments, with the route's wording.
--
-- Deliberate differences from the routes:
--   1. Atomic: every write of one call is one transaction (the PUT route could
--      leave a general-ledger row updated without its vendor mirror).
--   2. Order-owned rows (entry_type order_payment, or linked to an order) are
--      written only by create_order / record_payment (20261119000100) and by
--      sync. The manual functions refuse to create, edit or delete them
--      (SQLSTATE 23514) and do not accept order_id. The routes allowed both.
--   3. Amounts must be greater than zero (the routes accepted negatives).
--   4. Bills can be edited and deleted (bill-only rows, never a mirror).
--
-- RUNNING BALANCES
-- ----------------
--   general_ledger.balance is maintained by the existing per-business triggers
--   (20261106000000_multi_business_techlink.sql): every insert / update /
--   delete re-walks the business's book from the earliest affected row under
--   the business's advisory lock. These functions take the same lock first, so
--   a call's writes and the recalculation run as one serial unit.
--   vendor_ledger.balance (debit - credit, cumulative per vendor in
--   (entry_date, created_at, id) order) is recomputed for every vendor a call
--   touches, inside the same transaction, after its writes.
--
-- Errors (mapped by the app's data provider):
--   42501 not signed in / not an admin / not a member of the business
--   P0002 entry, bill or vendor not found
--   22023 invalid input        23514 order-owned row, or a mirror edited as a bill
--
-- Idempotent (CREATE OR REPLACE; grants repeatable). One transaction.

begin;

-- ---------------------------------------------------------------- helpers
-- Internal: not executable by clients.

create or replace function public.ledger_entry_require_admin(p_business_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized - Please sign in' using errcode = '42501';
  end if;
  if not coalesce(public.current_user_is_admin(), false) then
    raise exception 'Forbidden - Only an admin can change the ledger' using errcode = '42501';
  end if;
  if p_business_id is null
     or p_business_id not in (select public.current_user_business_ids()) then
    raise exception 'Forbidden - No access to this business' using errcode = '42501';
  end if;
end;
$$;

-- A JSON amount as numeric(12,2); null for null / "" / absent / 0.
create or replace function public.ledger_entry_amount(p_value jsonb)
returns numeric
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v numeric;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' or p_value = '""'::jsonb then
    return null;
  end if;
  begin
    v := (p_value #>> '{}')::numeric;
  exception when invalid_text_representation then
    raise exception 'Invalid amount: %', p_value #>> '{}' using errcode = '22023';
  end;
  if v = 0 then
    return null;
  end if;
  if v < 0 then
    raise exception 'Amount must be greater than zero' using errcode = '22023';
  end if;
  if v >= 10000000000 then
    raise exception 'Amount is too large' using errcode = '22023';
  end if;
  return round(v, 2);
end;
$$;

-- Exactly one of debit / credit.
create or replace function public.ledger_entry_check_side(p_debit numeric, p_credit numeric)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if (p_debit is not null and p_credit is not null) or (p_debit is null and p_credit is null) then
    raise exception 'Provide either debit or credit, not both' using errcode = '22023';
  end if;
end;
$$;

-- A row written by an order or a payment (create_order / record_payment / sync).
create or replace function public.ledger_entry_is_order_owned(p_entry_type text, p_order_id uuid)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_entry_type = 'order_payment' or p_order_id is not null
$$;

-- Validates a manual entry for p_business_id and returns it normalised:
-- {entry_date, particulars, debit, credit, entry_type, notes, vendor_id, tag_id}.
create or replace function public.ledger_entry_normalise(p_business_id uuid, p_entry jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_date        date;
  v_type        text;
  v_debit       numeric;
  v_credit      numeric;
  v_vendor      uuid;
  v_vendor_name text;
  v_tag         uuid;
  v_particulars text;
begin
  if p_entry is null or jsonb_typeof(p_entry) <> 'object' then
    raise exception 'Entry details are required' using errcode = '22023';
  end if;

  if nullif(p_entry ->> 'order_id', '') is not null then
    raise exception 'Entries for an order are written by the order and its payments' using errcode = '23514';
  end if;

  v_date := nullif(p_entry ->> 'entry_date', '')::date;
  if v_date is null then
    raise exception 'Entry date is required' using errcode = '22023';
  end if;

  v_type := nullif(p_entry ->> 'entry_type', '');
  if v_type is null then
    raise exception 'Entry type is required' using errcode = '22023';
  end if;
  if v_type = 'order_payment' then
    raise exception 'Order payments are recorded on the order (record a payment or edit the order)' using errcode = '23514';
  end if;
  if v_type not in ('opening_balance', 'vendor_payment', 'miscellaneous') then
    raise exception 'Invalid entry type: %', v_type using errcode = '22023';
  end if;

  v_debit  := public.ledger_entry_amount(p_entry -> 'debit');
  v_credit := public.ledger_entry_amount(p_entry -> 'credit');
  perform public.ledger_entry_check_side(v_debit, v_credit);

  v_vendor := nullif(p_entry ->> 'vendor_id', '')::uuid;
  if v_vendor is not null then
    select v.name into v_vendor_name
      from public.vendors v
     where v.id = v_vendor and v.business_id = p_business_id;
    if not found then
      raise exception 'Vendor not found' using errcode = 'P0002';
    end if;
  elsif v_type = 'vendor_payment' then
    raise exception 'Please select a vendor' using errcode = '22023';
  end if;

  v_tag := nullif(p_entry ->> 'tag_id', '')::uuid;
  if v_tag is not null and not exists (
    select 1 from public.vendor_tags t join public.vendors v on v.id = t.vendor_id
     where t.id = v_tag and v.business_id = p_business_id
  ) then
    raise exception 'Tag not found' using errcode = 'P0002';
  end if;

  v_particulars := btrim(coalesce(p_entry ->> 'particulars', ''));
  if v_particulars = '' and v_type = 'vendor_payment' then
    v_particulars := v_vendor_name;
  end if;
  if v_particulars = '' then
    raise exception 'Particulars is required' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'entry_date', v_date,
    'particulars', v_particulars,
    'debit', v_debit,
    'credit', v_credit,
    'entry_type', v_type,
    'notes', nullif(btrim(coalesce(p_entry ->> 'notes', '')), ''),
    'vendor_id', v_vendor,
    'tag_id', v_tag
  );
end;
$$;

-- Rewrites vendor_ledger.balance for one vendor: cumulative debit - credit in
-- (entry_date, created_at, id) order. Returns rows changed.
create or replace function public.ledger_entry_recalc_vendor(p_vendor_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_changed integer := 0;
begin
  if p_vendor_id is null then
    return 0;
  end if;
  with ordered as (
    select vl.id,
           sum(coalesce(vl.debit, 0) - coalesce(vl.credit, 0))
             over (order by vl.entry_date, vl.created_at, vl.id
                   rows between unbounded preceding and current row) as new_balance
      from public.vendor_ledger vl
     where vl.vendor_id = p_vendor_id
  ),
  applied as (
    update public.vendor_ledger vl
       set balance = ordered.new_balance
      from ordered
     where vl.id = ordered.id
       and vl.balance is distinct from ordered.new_balance
    returning 1
  )
  select count(*) into v_changed from applied;
  return v_changed;
end;
$$;

-- One general-ledger row as the app reads it.
create or replace function public.ledger_entry_json(p_entry_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select to_jsonb(gl)
         || jsonb_build_object(
              'vendors', (select jsonb_build_object('id', v.id, 'name', v.name) from public.vendors v where v.id = gl.vendor_id),
              'orders', (select jsonb_build_object('id', o.id, 'order_number', o.order_number) from public.orders o where o.id = gl.order_id)
            )
    from public.general_ledger gl
   where gl.id = p_entry_id
$$;

-- ---------------------------------------------------------------- create_ledger_entry
create or replace function public.create_ledger_entry(p_business_id uuid, p_entry jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v   jsonb;
  v_id uuid;
begin
  perform public.ledger_entry_require_admin(p_business_id);
  perform pg_advisory_xact_lock(public.general_ledger_lock_key(p_business_id));
  v := public.ledger_entry_normalise(p_business_id, p_entry);

  insert into public.general_ledger
         (business_id, entry_date, particulars, debit, credit, entry_type, notes, vendor_id, tag_id)
  values (p_business_id,
          (v ->> 'entry_date')::date,
          v ->> 'particulars',
          (v ->> 'debit')::numeric,
          (v ->> 'credit')::numeric,
          v ->> 'entry_type',
          v ->> 'notes',
          (v ->> 'vendor_id')::uuid,
          (v ->> 'tag_id')::uuid)
  returning id into v_id;

  if (v ->> 'vendor_id') is not null then
    -- The AFTER INSERT trigger wrote the vendor mirror; write it if it did not.
    if not exists (select 1 from public.vendor_ledger where general_ledger_id = v_id) then
      insert into public.vendor_ledger
             (business_id, vendor_id, general_ledger_id, entry_date, particulars, debit, credit, balance, notes)
      values (p_business_id, (v ->> 'vendor_id')::uuid, v_id, (v ->> 'entry_date')::date, v ->> 'particulars',
              (v ->> 'credit')::numeric, (v ->> 'debit')::numeric, 0, v ->> 'notes');
    end if;
    perform public.ledger_entry_recalc_vendor((v ->> 'vendor_id')::uuid);
  end if;

  return public.ledger_entry_json(v_id);
end;
$$;

-- ---------------------------------------------------------------- update_ledger_entry
create or replace function public.update_ledger_entry(p_entry_id uuid, p_entry jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid;
  v_row      public.general_ledger;
  v          jsonb;
  v_new_vendor uuid;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized - Please sign in' using errcode = '42501';
  end if;
  select gl.business_id into v_business from public.general_ledger gl where gl.id = p_entry_id;
  if v_business is null then
    raise exception 'Entry not found' using errcode = 'P0002';
  end if;
  perform public.ledger_entry_require_admin(v_business);
  perform pg_advisory_xact_lock(public.general_ledger_lock_key(v_business));

  select * into v_row from public.general_ledger where id = p_entry_id for update;
  if public.ledger_entry_is_order_owned(v_row.entry_type::text, v_row.order_id) then
    raise exception 'This entry belongs to an order; change it on the order' using errcode = '23514';
  end if;

  v := public.ledger_entry_normalise(v_business, p_entry);
  v_new_vendor := (v ->> 'vendor_id')::uuid;

  -- tag_id is kept unless the caller sends one, as the PUT route did.
  update public.general_ledger
     set entry_date  = (v ->> 'entry_date')::date,
         particulars = v ->> 'particulars',
         debit       = (v ->> 'debit')::numeric,
         credit      = (v ->> 'credit')::numeric,
         entry_type  = v ->> 'entry_type',
         notes       = v ->> 'notes',
         vendor_id   = v_new_vendor,
         tag_id      = case when p_entry ? 'tag_id' then (v ->> 'tag_id')::uuid else tag_id end,
         updated_at  = now()
   where id = p_entry_id;

  -- One mirror row, rewritten from the updated entry (debit / credit swapped).
  delete from public.vendor_ledger where general_ledger_id = p_entry_id;
  if v_new_vendor is not null then
    insert into public.vendor_ledger
           (business_id, vendor_id, general_ledger_id, entry_date, particulars, debit, credit, balance, notes)
    values (v_business, v_new_vendor, p_entry_id, (v ->> 'entry_date')::date, v ->> 'particulars',
            (v ->> 'credit')::numeric, (v ->> 'debit')::numeric, 0, v ->> 'notes');
  end if;

  perform public.ledger_entry_recalc_vendor(v_row.vendor_id);
  if v_new_vendor is distinct from v_row.vendor_id then
    perform public.ledger_entry_recalc_vendor(v_new_vendor);
  end if;

  return public.ledger_entry_json(p_entry_id);
end;
$$;

-- ---------------------------------------------------------------- delete_ledger_entry
create or replace function public.delete_ledger_entry(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid;
  v_row      public.general_ledger;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized - Please sign in' using errcode = '42501';
  end if;
  select gl.business_id into v_business from public.general_ledger gl where gl.id = p_entry_id;
  if v_business is null then
    raise exception 'Entry not found' using errcode = 'P0002';
  end if;
  perform public.ledger_entry_require_admin(v_business);
  perform pg_advisory_xact_lock(public.general_ledger_lock_key(v_business));

  select * into v_row from public.general_ledger where id = p_entry_id for update;
  if public.ledger_entry_is_order_owned(v_row.entry_type::text, v_row.order_id) then
    raise exception 'This entry belongs to an order; change it on the order' using errcode = '23514';
  end if;

  delete from public.vendor_ledger where general_ledger_id = p_entry_id;
  delete from public.general_ledger where id = p_entry_id;
  perform public.ledger_entry_recalc_vendor(v_row.vendor_id);

  return jsonb_build_object('id', p_entry_id);
end;
$$;

-- ---------------------------------------------------------------- vendor bills
-- Validates a bill: {entry_date, particulars, debit | credit | amount (= credit), notes}.
create or replace function public.vendor_bill_normalise(p_bill jsonb)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_date        date;
  v_debit       numeric;
  v_credit      numeric;
  v_particulars text;
begin
  if p_bill is null or jsonb_typeof(p_bill) <> 'object' then
    raise exception 'Bill details are required' using errcode = '22023';
  end if;
  v_date := nullif(p_bill ->> 'entry_date', '')::date;
  if v_date is null then
    raise exception 'Date is required' using errcode = '22023';
  end if;
  v_particulars := btrim(coalesce(p_bill ->> 'particulars', ''));
  if v_particulars = '' then
    raise exception 'Particulars is required' using errcode = '22023';
  end if;
  v_debit  := public.ledger_entry_amount(p_bill -> 'debit');
  v_credit := coalesce(public.ledger_entry_amount(p_bill -> 'credit'), public.ledger_entry_amount(p_bill -> 'amount'));
  perform public.ledger_entry_check_side(v_debit, v_credit);
  return jsonb_build_object(
    'entry_date', v_date,
    'particulars', v_particulars,
    'debit', v_debit,
    'credit', v_credit,
    'notes', nullif(btrim(coalesce(p_bill ->> 'notes', '')), '')
  );
end;
$$;

create or replace function public.vendor_bill_json(p_bill_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'id', vl.id, 'business_id', vl.business_id, 'vendor_id', vl.vendor_id,
           'general_ledger_id', vl.general_ledger_id, 'entry_date', vl.entry_date,
           'particulars', vl.particulars, 'debit', vl.debit, 'credit', vl.credit,
           'balance', vl.balance, 'notes', vl.notes, 'created_at', vl.created_at)
    from public.vendor_ledger vl
   where vl.id = p_bill_id
$$;

create or replace function public.record_vendor_bill(p_vendor_id uuid, p_bill jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid;
  v          jsonb;
  v_id       uuid;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized - Please sign in' using errcode = '42501';
  end if;
  select vd.business_id into v_business from public.vendors vd where vd.id = p_vendor_id;
  if v_business is null then
    raise exception 'Vendor not found' using errcode = 'P0002';
  end if;
  perform public.ledger_entry_require_admin(v_business);
  perform pg_advisory_xact_lock(public.general_ledger_lock_key(v_business));
  v := public.vendor_bill_normalise(p_bill);

  insert into public.vendor_ledger
         (business_id, vendor_id, general_ledger_id, entry_date, particulars, debit, credit, balance, notes)
  values (v_business, p_vendor_id, null, (v ->> 'entry_date')::date, v ->> 'particulars',
          (v ->> 'debit')::numeric, (v ->> 'credit')::numeric, 0, v ->> 'notes')
  returning id into v_id;

  perform public.ledger_entry_recalc_vendor(p_vendor_id);
  return public.vendor_bill_json(v_id);
end;
$$;

create or replace function public.update_vendor_bill(p_bill_id uuid, p_bill jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid;
  v_vendor   uuid;
  v_gl       uuid;
  v          jsonb;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized - Please sign in' using errcode = '42501';
  end if;
  select vl.business_id, vl.vendor_id into v_business, v_vendor from public.vendor_ledger vl where vl.id = p_bill_id;
  if v_business is null then
    raise exception 'Bill not found' using errcode = 'P0002';
  end if;
  perform public.ledger_entry_require_admin(v_business);
  perform pg_advisory_xact_lock(public.general_ledger_lock_key(v_business));

  select vl.general_ledger_id into v_gl from public.vendor_ledger vl where vl.id = p_bill_id for update;
  if v_gl is not null then
    raise exception 'This entry mirrors a general ledger entry; edit it in the ledger' using errcode = '23514';
  end if;
  v := public.vendor_bill_normalise(p_bill);

  update public.vendor_ledger
     set entry_date  = (v ->> 'entry_date')::date,
         particulars = v ->> 'particulars',
         debit       = (v ->> 'debit')::numeric,
         credit      = (v ->> 'credit')::numeric,
         notes       = v ->> 'notes'
   where id = p_bill_id;

  perform public.ledger_entry_recalc_vendor(v_vendor);
  return public.vendor_bill_json(p_bill_id);
end;
$$;

create or replace function public.delete_vendor_bill(p_bill_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid;
  v_vendor   uuid;
  v_gl       uuid;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized - Please sign in' using errcode = '42501';
  end if;
  select vl.business_id, vl.vendor_id into v_business, v_vendor from public.vendor_ledger vl where vl.id = p_bill_id;
  if v_business is null then
    raise exception 'Bill not found' using errcode = 'P0002';
  end if;
  perform public.ledger_entry_require_admin(v_business);
  perform pg_advisory_xact_lock(public.general_ledger_lock_key(v_business));

  select vl.general_ledger_id into v_gl from public.vendor_ledger vl where vl.id = p_bill_id for update;
  if v_gl is not null then
    raise exception 'This entry mirrors a general ledger entry; delete it in the ledger' using errcode = '23514';
  end if;

  delete from public.vendor_ledger where id = p_bill_id;
  perform public.ledger_entry_recalc_vendor(v_vendor);
  return jsonb_build_object('id', p_bill_id);
end;
$$;

-- ---------------------------------------------------------------- vendor_ledger_entries
-- One vendor's sub-ledger, newest first. owed_after = cumulative credit - debit
-- (billed minus paid) in (entry_date, created_at, id) order; kind is 'bill'
-- (bill-only row), 'order' (mirror of an order-owned entry) or 'ledger'
-- (mirror of a manual entry, e.g. a vendor payment).
create or replace function public.vendor_ledger_entries(p_vendor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_vendor public.vendors;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized - Please sign in' using errcode = '42501';
  end if;
  select * into v_vendor from public.vendors where id = p_vendor_id;
  if not found then
    raise exception 'Vendor not found' using errcode = 'P0002';
  end if;
  perform public.ledger_entry_require_admin(v_vendor.business_id);

  with vrows as (
    select vl.id, vl.entry_date, vl.particulars, vl.debit, vl.credit, vl.notes, vl.created_at,
           vl.general_ledger_id,
           gl.entry_type::text as entry_type, gl.order_id, o.order_number,
           case
             when vl.general_ledger_id is null then 'bill'
             when public.ledger_entry_is_order_owned(gl.entry_type::text, gl.order_id) then 'order'
             else 'ledger'
           end as kind,
           sum(coalesce(vl.credit, 0) - coalesce(vl.debit, 0))
             over (order by vl.entry_date, vl.created_at, vl.id
                   rows between unbounded preceding and current row) as owed_after
      from public.vendor_ledger vl
      left join public.general_ledger gl on gl.id = vl.general_ledger_id
      left join public.orders o on o.id = gl.order_id
     where vl.vendor_id = p_vendor_id
  )
  select jsonb_build_object(
           'vendor', jsonb_build_object('id', v_vendor.id, 'name', v_vendor.name, 'business_id', v_vendor.business_id),
           'rows', coalesce((
             select jsonb_agg(to_jsonb(r) order by r.entry_date desc, r.created_at desc, r.id desc) from vrows r
           ), '[]'::jsonb),
           'totals', jsonb_build_object(
             'billed', coalesce((select sum(coalesce(credit, 0)) from vrows), 0),
             'paid', coalesce((select sum(coalesce(debit, 0)) from vrows), 0),
             'owed', coalesce((select sum(coalesce(credit, 0) - coalesce(debit, 0)) from vrows), 0),
             'entries', (select count(*) from vrows)
           )
         )
    into v_result;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------- sync_order_payment_ledger
create or replace function public.sync_order_payment_ledger(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_orders   integer;
  v_payments integer;
begin
  perform public.ledger_entry_require_admin(p_business_id);
  perform pg_advisory_xact_lock(public.general_ledger_lock_key(p_business_id));

  delete from public.general_ledger
   where business_id = p_business_id and entry_type = 'order_payment';

  insert into public.general_ledger (business_id, entry_date, particulars, debit, entry_type, order_id, notes)
  select p_business_id, o.booking_date, 'Advance payment for Order #' || o.order_number, o.advance_paid,
         'order_payment', o.id, 'Synced from order advance payment'
    from public.orders o
   where o.business_id = p_business_id and o.advance_paid > 0;
  get diagnostics v_orders = row_count;

  insert into public.general_ledger (business_id, entry_date, particulars, debit, entry_type, order_id, notes)
  select p_business_id, p.payment_date, 'Payment for Order #' || coalesce(o.order_number, 'Unknown'), p.amount,
         'order_payment', p.order_id, coalesce(nullif(p.notes, ''), 'Payment via ' || p.payment_method::text)
    from public.payments p
    join public.orders o on o.id = p.order_id
   where p.business_id = p_business_id;
  get diagnostics v_payments = row_count;

  return jsonb_build_object('synced', v_orders + v_payments, 'orders', v_orders, 'payments', v_payments);
end;
$$;

-- ---------------------------------------------------------------- privileges
revoke all on function public.ledger_entry_require_admin(uuid) from public, anon, authenticated;
revoke all on function public.ledger_entry_amount(jsonb) from public, anon, authenticated;
revoke all on function public.ledger_entry_check_side(numeric, numeric) from public, anon, authenticated;
revoke all on function public.ledger_entry_is_order_owned(text, uuid) from public, anon, authenticated;
revoke all on function public.ledger_entry_normalise(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.ledger_entry_recalc_vendor(uuid) from public, anon, authenticated;
revoke all on function public.ledger_entry_json(uuid) from public, anon, authenticated;
revoke all on function public.vendor_bill_normalise(jsonb) from public, anon, authenticated;
revoke all on function public.vendor_bill_json(uuid) from public, anon, authenticated;

revoke all on function public.create_ledger_entry(uuid, jsonb) from public, anon;
revoke all on function public.update_ledger_entry(uuid, jsonb) from public, anon;
revoke all on function public.delete_ledger_entry(uuid) from public, anon;
revoke all on function public.record_vendor_bill(uuid, jsonb) from public, anon;
revoke all on function public.update_vendor_bill(uuid, jsonb) from public, anon;
revoke all on function public.delete_vendor_bill(uuid) from public, anon;
revoke all on function public.vendor_ledger_entries(uuid) from public, anon;
revoke all on function public.sync_order_payment_ledger(uuid) from public, anon;

grant execute on function public.create_ledger_entry(uuid, jsonb) to authenticated;
grant execute on function public.update_ledger_entry(uuid, jsonb) to authenticated;
grant execute on function public.delete_ledger_entry(uuid) to authenticated;
grant execute on function public.record_vendor_bill(uuid, jsonb) to authenticated;
grant execute on function public.update_vendor_bill(uuid, jsonb) to authenticated;
grant execute on function public.delete_vendor_bill(uuid) to authenticated;
grant execute on function public.vendor_ledger_entries(uuid) to authenticated;
grant execute on function public.sync_order_payment_ledger(uuid) to authenticated;

commit;
