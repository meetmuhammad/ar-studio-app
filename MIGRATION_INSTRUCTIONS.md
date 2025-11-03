# Migration Instructions - Order Status Feature

## Overview
This document outlines the changes made to implement the order status feature and instructions for deploying these changes.

## Changes Summary

### 1. ✅ Turban Size Validation Update
- **Changed**: Turban max size from 20 to 25 inches
- **Files Modified**:
  - `src/types/measurements.ts` - Updated validation schema
  - `src/components/forms/measurement-form.tsx` - Updated max attribute in input field

### 2. ✅ Order Status Field Implementation
- **Added**: Order status field with values: "In Process", "Delivered", "Cancelled"
- **Default**: New orders default to "In Process"
- **Files Modified**:
  - `src/lib/supabase-client.ts` - Added OrderStatus type
  - `src/lib/validators.ts` - Added status to schemas
  - `src/lib/database.ts` - Added status filtering
  - `src/app/api/orders/route.ts` - Handle status in create/update
  - `src/app/api/orders/[id]/route.ts` - Handle status in updates
  - `src/components/data-table/columns/order-columns.tsx` - Display status badge
  - `src/components/forms/order-steps/general-info-step.tsx` - Status selector in form
  - `src/components/forms/order-multistep-form.tsx` - Status in default values

### 3. ✅ Order Sorting by Delivery Date
- **Changed**: Default sort from `created_at DESC` to `delivery_date ASC`
- **Purpose**: Show orders by upcoming delivery dates first
- **Files Modified**:
  - `src/lib/database.ts` - Changed default sort parameters
  - `src/app/api/orders/route.ts` - Updated default sortDir to 'asc'
  - `src/components/data-table/columns/order-columns.tsx` - Made delivery_date column sortable

### 4. ✅ Order Status Filtering
- **Added**: Status filter dropdown in Orders page
- **Options**: All Orders, In Process, Delivered, Cancelled
- **Files Modified**:
  - `src/app/(dashboard)/orders/page.tsx` - Added status filter UI and logic
  - `src/lib/validators.ts` - Added status to OrderQuerySchema
  - `src/lib/database.ts` - Added status filtering in getOrders()
  - `src/app/api/orders/route.ts` - Pass status filter to database query

## Database Migration Required

### Step 1: Run the Migration
Execute the migration file in your Supabase SQL Editor:

```bash
supabase/migrations/007_add_order_status.sql
```

**Migration Contents:**
```sql
-- Create enum type for order status
CREATE TYPE order_status AS ENUM ('In Process', 'Delivered', 'Cancelled');

-- Add status column to orders table with default value 'In Process'
ALTER TABLE orders 
ADD COLUMN status order_status DEFAULT 'In Process' NOT NULL;

-- Create index on status for better query performance
CREATE INDEX idx_orders_status ON orders(status);

-- Create index on delivery_date for sorting
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders(delivery_date);
```

### Step 2: Verify Migration
After running the migration, verify:
1. The `status` column exists in the `orders` table
2. All existing orders have status = 'In Process'
3. Indexes are created for `status` and `delivery_date`

```sql
-- Check the orders table structure
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'orders' AND column_name = 'status';

-- Verify existing orders have default status
SELECT COUNT(*), status 
FROM orders 
GROUP BY status;

-- Check indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'orders' 
AND indexname IN ('idx_orders_status', 'idx_orders_delivery_date');
```

## Testing Checklist

### Backend Testing
- [ ] Create new order - verify status defaults to "In Process"
- [ ] Update order status - verify status updates correctly
- [ ] Filter orders by status - verify filtering works
- [ ] Sort orders by delivery date - verify ascending order

### Frontend Testing
- [ ] Orders page loads with correct sorting (upcoming delivery dates first)
- [ ] Status badge displays correctly in orders table
- [ ] Status filter dropdown works
- [ ] Order form shows status selector
- [ ] Creating new order defaults to "In Process"
- [ ] Editing order allows changing status
- [ ] Measurement form accepts turban size up to 25

### Edge Cases
- [ ] Orders without delivery_date handle sorting correctly
- [ ] Filter "All Orders" shows all statuses
- [ ] Status changes persist after page refresh

## Deployment Steps

1. **Backup Database** (recommended)
   ```bash
   # Create a backup before running migrations
   ```

2. **Run Database Migration**
   - Execute `007_add_order_status.sql` in Supabase SQL Editor
   - Verify migration success

3. **Deploy Code Changes**
   ```bash
   # If using git
   git add .
   git commit -m "feat: add order status field and improve sorting"
   git push
   
   # Deploy to your hosting platform (Vercel, etc.)
   ```

4. **Verify Deployment**
   - Test all features in production
   - Check that existing orders show "In Process" status
   - Verify sorting and filtering work correctly

## Rollback Plan

If issues arise, you can rollback the migration:

```sql
-- Remove the status column
ALTER TABLE orders DROP COLUMN status;

-- Remove the enum type
DROP TYPE order_status;

-- Remove indexes (if needed)
DROP INDEX IF EXISTS idx_orders_status;
DROP INDEX IF EXISTS idx_orders_delivery_date;
```

Then revert the code changes using git:
```bash
git revert <commit-hash>
git push
```

## Notes
- All existing orders will automatically get status "In Process" after migration
- The status field is required (NOT NULL) with a default value
- Status changes are logged in the `updated_at` timestamp
- The delivery date sorting helps prioritize upcoming orders
- Status filtering helps admins track order fulfillment progress
