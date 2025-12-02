# Vendor Sub-Ledger Flow Documentation

## Overview

The vendor sub-ledger now supports **two types of entries**:

1. **Linked entries** - From main ledger (with `general_ledger_id`)
2. **Independent entries** - Sub-ledger only (no `general_ledger_id`)

---

## Entry Types & Flow

### **Type 1: Main Ledger → Sub Ledger (Linked)**

**Use Case**: When you make a payment to a vendor

**User Action**: 
- Create entry in main ledger (`/ledger`)
- Select Entry Type: "Vendor Payment"
- Select Vendor
- Amount goes in **Credit** field (money OUT)

**What Happens**:
```
Main Ledger (general_ledger):
{
  id: "gl-123",
  entry_date: "2024-12-02",
  particulars: "Payment for fabric",
  debit: null,
  credit: 5000,        // Money OUT to vendor
  entry_type: "vendor_payment",
  vendor_id: "vendor-1"
}

↓ Automatically creates ↓

Vendor Sub-Ledger (vendor_ledger):
{
  id: "vl-456",
  vendor_id: "vendor-1",
  general_ledger_id: "gl-123",  // LINKED
  entry_date: "2024-12-02",
  particulars: "Payment for fabric",
  debit: 5000,         // REVERSED - Vendor receives money
  credit: null
}
```

**Display**:
- Main ledger: Shows as "vendor payment" badge
- Vendor sub-ledger: Shows as "vendor payment" badge

---

### **Type 2: Sub Ledger Only (Independent)**

**Use Case**: When vendor sends you a bill/invoice (you owe them money)

**User Action**: 
- Go to vendor sub-ledger (`/vendors/{id}`)
- Click **"Create Bill"** button
- Enter date, particulars, amount

**What Happens**:
```
Vendor Sub-Ledger (vendor_ledger):
{
  id: "vl-789",
  vendor_id: "vendor-1",
  general_ledger_id: null,     // NOT LINKED
  entry_date: "2024-12-02",
  particulars: "Fabric bill",
  debit: null,
  credit: 8000,        // Bill/invoice amount (we owe vendor)
}

Main Ledger (general_ledger):
NO ENTRY CREATED ❌
```

**Display**:
- Main ledger: Does NOT appear
- Vendor sub-ledger: Shows as "Vendor Bill" badge

---

## Complete Example Scenario

### Scenario: Fabric Vendor Transaction

**Day 1**: Vendor sends you a bill for PKR 10,000
- Action: Create Bill in vendor sub-ledger
- Sub-ledger entry: Credit 10,000 (we owe vendor)
- Main ledger: No entry

**Day 5**: You pay vendor PKR 6,000
- Action: Create "Vendor Payment" in main ledger
- Main ledger entry: Credit 6,000 (money OUT)
- Sub-ledger entry: Debit 6,000 (vendor receives)

**Day 10**: You pay remaining PKR 4,000
- Action: Create "Vendor Payment" in main ledger
- Main ledger entry: Credit 4,000 (money OUT)
- Sub-ledger entry: Debit 4,000 (vendor receives)

### Ledger Views:

**Main Ledger** (`/ledger`):
```
Date       | Particulars      | Type           | Debit | Credit | Balance
-----------|------------------|----------------|-------|--------|--------
Dec 5      | Payment to ABC   | vendor_payment | -     | 6000   | -6000
Dec 10     | Payment to ABC   | vendor_payment | -     | 4000   | -10000
```

**Vendor Sub-Ledger** (`/vendors/abc`):
```
Date       | Particulars      | Type         | Debit | Credit | Balance
-----------|------------------|--------------|-------|--------|--------
Dec 1      | Fabric bill      | Vendor Bill  | -     | 10000  | -10000
Dec 5      | Payment to ABC   | vendor_pay   | 6000  | -      | -4000
Dec 10     | Payment to ABC   | vendor_pay   | 4000  | -      | 0
```

**Balance Interpretation**:
- Sub-ledger balance = -10000 + 6000 + 4000 = 0
- Positive balance = We owe vendor
- Negative balance = Vendor owes us
- Zero balance = All settled ✅

---

## API Endpoints

### Create Vendor Bill (Sub-ledger only)
```
POST /api/vendor-ledger
Body: {
  vendor_id: "vendor-1",
  entry_date: "2024-12-02",
  particulars: "Fabric bill",
  credit: 10000,
  notes: "Invoice #123"
}
```

### Create Vendor Payment (Main ledger + Sub-ledger)
```
POST /api/general-ledger
Body: {
  entry_date: "2024-12-02",
  particulars: "Payment for fabric",
  credit: 6000,
  entry_type: "vendor_payment",
  vendor_id: "vendor-1",
  notes: "Check #456"
}

→ Automatically creates linked vendor_ledger entry
```

---

## Database Schema

### vendor_ledger table
```sql
id                  UUID PRIMARY KEY
vendor_id          UUID NOT NULL REFERENCES vendors(id)
general_ledger_id  UUID REFERENCES general_ledger(id)  -- NULL for bills
entry_date         DATE NOT NULL
particulars        TEXT NOT NULL
debit              DECIMAL
credit             DECIMAL
notes              TEXT
created_at         TIMESTAMP
updated_at         TIMESTAMP
```

**Key Points**:
- `general_ledger_id = NULL` → Independent entry (bill)
- `general_ledger_id = UUID` → Linked entry (payment)

---

## UI Changes

### Vendor Sub-Ledger Page (`/vendors/{id}`)

**Header**:
```
[← Back]  🏢 Vendor ABC              [+ Create Bill]
          Vendor Ledger
```

**Entry Type Badges**:
- **"vendor payment"** badge → Linked to main ledger (payment made)
- **"Vendor Bill"** badge → Independent (bill received)

### Main Ledger Page (`/ledger`)

**Entry Type Options**:
- Opening Balance
- **Vendor Payment** → Creates linked sub-ledger entry
- Miscellaneous

---

## Accounting Logic

### Vendor Sub-Ledger Perspective:

| Entry Type | Debit | Credit | Meaning |
|------------|-------|--------|---------|
| Payment (from main) | ✅ | - | Vendor receives money from us |
| Bill (independent) | - | ✅ | Vendor sends us a bill/invoice |

**Balance Formula**: `Total Debit - Total Credit`
- Positive = We owe vendor (accounts payable)
- Negative = Vendor owes us (accounts receivable)
- Zero = Fully settled

### Main Ledger Perspective:

| Entry Type | Debit | Credit | Meaning |
|------------|-------|--------|---------|
| Order Payment | ✅ | - | Customer pays us |
| Vendor Payment | - | ✅ | We pay vendor |
| Opening Balance | ✅/❌ | ✅/❌ | Starting balance |
| Miscellaneous | ✅/❌ | ✅/❌ | Other transactions |

**Note**: Vendor bills do NOT appear in main ledger!

---

## Benefits of This Approach

1. **Track Unpaid Bills**: Vendor bills show in sub-ledger before payment
2. **Accurate Vendor Balance**: See what you owe each vendor
3. **Clean Main Ledger**: Main ledger only shows actual cash movements
4. **Flexible**: Pay bills partially or in full
5. **Independent Records**: Bills tracked separately from payments

---

## Common Operations

### Check Vendor Balance
```
Go to /vendors/{id}
Look at "Net Balance" card
- Red (positive) = You owe vendor
- Green (negative) = Vendor owes you
```

### Record Vendor Bill
```
1. Go to /vendors/{id}
2. Click "Create Bill"
3. Enter date, particulars, amount
4. Submit
→ Creates Credit entry in vendor ledger
→ Increases "We owe vendor" balance
```

### Pay Vendor
```
1. Go to /ledger
2. Click "Add Entry"
3. Select "Vendor Payment"
4. Select vendor
5. Enter amount in Credit field
6. Submit
→ Creates Credit entry in main ledger
→ Creates Debit entry in vendor ledger
→ Decreases "We owe vendor" balance
```

---

## Important Notes

⚠️ **Vendor Payment vs Vendor Bill**:
- **Vendor Payment** (main ledger) = Money leaving your account
- **Vendor Bill** (sub-ledger only) = Invoice received, not yet paid

⚠️ **Balance Calculation**:
- Sub-ledger balance = `Debit - Credit`
- Positive balance = Liability (you owe vendor)

⚠️ **General Ledger Link**:
- Linked entries (`general_ledger_id != NULL`) are synced
- Independent entries (`general_ledger_id = NULL`) are sub-ledger only
- Deleting main ledger entry does NOT delete independent sub-ledger bills

---

## Conclusion

The vendor sub-ledger now supports **two entry types**:
1. **Linked** (payments) - Created from main ledger
2. **Independent** (bills) - Created directly in sub-ledger

This provides a complete accounts payable system for tracking vendor bills and payments separately.
