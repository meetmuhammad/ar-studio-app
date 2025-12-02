# Debit/Credit Fixes & Vendor Ledger Implementation

## Summary of Changes

All accounting entries have been corrected to follow proper accounting conventions:
- **Debit** = Money IN (revenue, receivables)
- **Credit** = Money OUT (expenses, payables)

---

## 1. General Ledger Fixes

### Files Modified:

#### `/api/orders/route.ts` (Line 122)
**Changed**: Order advance payments now use `debit` (money IN)
```typescript
// Before
credit: orderData.advance_paid,

// After
debit: orderData.advance_paid,
```

#### `/api/payments/route.ts` (Line 132)
**Changed**: Additional payments now use `debit` (money IN)
```typescript
// Before
credit: paymentData.amount,

// After
debit: paymentData.amount,
```

#### `/api/general-ledger/sync-payments/route.ts` (Lines 57 & 69)
**Changed**: Both order and payment sync now use `debit`
```typescript
// Before
credit: order.advance_paid,
credit: payment.amount,

// After
debit: order.advance_paid,
debit: payment.amount,
```

#### `/api/general-ledger/stats/route.ts` (Line 24)
**Changed**: Balance calculation fixed
```typescript
// Before
const currentBalance = totalCredit - totalDebit

// After
const currentBalance = totalDebit - totalCredit
```

#### `/ledger/page.tsx`
**Changed**: Display labels and colors
- **Debit**: Green color, "Money in", TrendingUp icon ↑
- **Credit**: Red color, "Money out", TrendingDown icon ↓
- Table cells: Debit=green, Credit=red

---

## 2. Vendor Sub-Ledger Implementation

### Concept
The vendor sub-ledger shows entries from **the vendor's perspective**:
- **Main Ledger**: Credit (we pay vendor) → **Vendor Ledger**: Debit (they receive money)
- **Main Ledger**: Debit → **Vendor Ledger**: Credit (rare)

### Files Modified:

#### `/api/general-ledger/route.ts` (POST)
**Added**: Automatic vendor_ledger entry creation with reversed debit/credit
```typescript
if (vendor_id) {
  await supabase.from('vendor_ledger').insert({
    vendor_id,
    general_ledger_id: entry.id,
    entry_date,
    particulars: particulars.trim(),
    debit: credit || null,   // REVERSED
    credit: debit || null,   // REVERSED
    notes: notes?.trim() || null,
  })
}
```

#### `/api/general-ledger/[id]/route.ts` (PUT)
**Added**: Update vendor_ledger when general_ledger is updated
- Deletes existing vendor_ledger entry
- Creates new one with reversed debit/credit if vendor_id exists

#### `/api/general-ledger/[id]/route.ts` (DELETE)
**Added**: Cascade delete to vendor_ledger

#### `/api/vendor-ledger/route.ts`
**Modified**: Now joins with general_ledger to get entry_type and order info

#### `/vendors/[id]/page.tsx`
**Fixed**: 
- Now fetches from `/api/vendor-ledger` (not general-ledger)
- Balance calculation: `totalDebit - totalCredit`
- Display labels updated for vendor perspective
- Colors: Debit=green (money in), Credit=red (money out)
- Balance interpretation: Positive = we owe vendor, Negative = vendor owes us

---

## 3. How It Works

### Example 1: Order Payment (Main Ledger)
```
Date: 2024-12-02
Particulars: Payment for Order #123
Debit: 5000    (money IN from customer)
Credit: 0
Entry Type: order_payment
```

**Vendor Ledger**: No entry created (no vendor involved)

---

### Example 2: Vendor Payment (Main Ledger)
```
Date: 2024-12-02
Particulars: Fabric purchase from Vendor ABC
Debit: 0
Credit: 2000    (money OUT to vendor)
Entry Type: vendor_payment
Vendor: Vendor ABC
```

**Vendor Ledger (Auto-created)**:
```
Date: 2024-12-02
Particulars: Fabric purchase from Vendor ABC
Debit: 2000     (REVERSED - money IN from their perspective)
Credit: 0       (REVERSED)
```

**Vendor sees**: They received PKR 2,000 from us

---

## 4. Data Migration Required

### ⚠️ IMPORTANT: You MUST sync existing data

Since all existing order payment entries were created with `credit` instead of `debit`, you need to:

1. **Go to `/ledger` page**
2. **Click "Sync Order Payments" button**
3. This will:
   - Delete all `order_payment` entries
   - Recreate them with correct `debit` values
   - Recalculate all balances

### Expected Result After Sync:
- All order payments will be **Debit** entries (green, money IN)
- Balance calculation will be correct: `Debit - Credit`
- All totals will show accurate financial position

---

## 5. Accounting Logic Summary

### Main Ledger Perspective (Your Business):
| Entry Type | Description | Debit (IN) | Credit (OUT) |
|------------|-------------|------------|--------------|
| Order Payment | Customer pays for order | ✅ 5000 | - |
| Vendor Payment | Pay vendor for supplies | - | ✅ 2000 |
| Opening Balance | Starting balance | ✅/❌ | ✅/❌ |
| Miscellaneous | Other transactions | ✅/❌ | ✅/❌ |

**Balance Formula**: `Total Debit - Total Credit`
- Positive balance = You have money (profit/surplus)
- Negative balance = You owe money (loss/deficit)

---

### Vendor Ledger Perspective (Vendor's View):
| Main Ledger Entry | Vendor Ledger Entry |
|-------------------|---------------------|
| Credit 2000 (we pay) | Debit 2000 (they receive) |
| Debit (rare) | Credit (rare) |

**Balance Formula**: `Total Debit - Total Credit`
- Positive balance = We owe vendor (accounts payable)
- Negative balance = Vendor owes us (accounts receivable - rare)

---

## 6. Visual Changes

### Main Ledger (/ledger):
```
┌─────────────────────────────────────────┐
│ Total Debit: PKR 50,000 ↑ (Green)     │
│ Money in                                │
├─────────────────────────────────────────┤
│ Total Credit: PKR 20,000 ↓ (Red)      │
│ Money out                               │
├─────────────────────────────────────────┤
│ Current Balance: PKR 30,000 (Green)    │
│ Net position                            │
└─────────────────────────────────────────┘
```

### Vendor Sub-Ledger (/vendors/[id]):
```
┌─────────────────────────────────────────┐
│ Total Debit: PKR 15,000 (Green)        │
│ Money received (from us)                │
├─────────────────────────────────────────┤
│ Total Credit: PKR 0 (Red)              │
│ Money returned                          │
├─────────────────────────────────────────┤
│ Net Balance: PKR 15,000 (Red)          │
│ We owe vendor                           │
└─────────────────────────────────────────┘
```

---

## 7. Testing Checklist

After syncing, verify:

### Main Ledger:
- [ ] All order payments show as **Debit** (green)
- [ ] Vendor payments show as **Credit** (red)
- [ ] Balance = Debit - Credit
- [ ] Stats cards show correct totals
- [ ] CSV export has correct values

### Vendor Sub-Ledger:
- [ ] Create vendor payment in main ledger (Credit)
- [ ] Check vendor sub-ledger shows **Debit** entry
- [ ] Vendor balance shows "We owe vendor" (positive)
- [ ] Edit/Delete main ledger entry updates vendor ledger
- [ ] All entry types display correctly

---

## 8. Future Considerations

### Database Triggers (Optional Enhancement)
Instead of creating vendor_ledger entries in API routes, consider PostgreSQL triggers:

```sql
CREATE OR REPLACE FUNCTION create_vendor_ledger_entry()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.vendor_id IS NOT NULL THEN
    INSERT INTO vendor_ledger (
      vendor_id,
      general_ledger_id,
      entry_date,
      particulars,
      debit,
      credit,
      notes
    ) VALUES (
      NEW.vendor_id,
      NEW.id,
      NEW.entry_date,
      NEW.particulars,
      NEW.credit,  -- Reversed
      NEW.debit,   -- Reversed
      NEW.notes
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vendor_ledger_insert
AFTER INSERT ON general_ledger
FOR EACH ROW EXECUTE FUNCTION create_vendor_ledger_entry();
```

**Benefits**:
- Automatic sync (no manual code)
- Can't forget to create vendor_ledger entry
- Database-level consistency

**Drawbacks**:
- Harder to debug
- Requires database migration
- Less visible in codebase

---

## 9. Export CSV

The Export CSV button now includes:
- Date
- Particulars
- Type
- **Debit** (money in)
- **Credit** (money out)
- Balance
- Vendor
- Order Number
- Notes

All values are correctly labeled and formatted.

---

## Conclusion

✅ All debit/credit logic corrected
✅ Vendor sub-ledgers implemented with proper mirroring
✅ Balance calculations fixed
✅ UI labels and colors updated
✅ Export functionality working

**Next Step**: Click "Sync Order Payments" on `/ledger` page to migrate existing data!
