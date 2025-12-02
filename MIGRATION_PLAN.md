# Ledger Functionality Migration Plan

**Branch**: `ledger-functionality` → `main`  
**Date**: 2025  
**Status**: Ready for Review

---

## Executive Summary

This document outlines the migration plan to move the complete ledger functionality from the `ledger-functionality` branch to the `main` branch and deploy it to production.

### Current State Analysis

**Ledger Branch Database** (.env.ledger):
- 65 orders
- 10 payments  
- 67 ledger entries (64 order_payment, 2 vendor_payment, 1 miscellaneous)
- 2 vendors

**Production Database** (.env):
- 65 orders
- 10 payments
- 67 ledger entries (64 order_payment, 2 vendor_payment, 1 miscellaneous)
- 2 vendors

**Key Finding**: ✅ Both databases have **identical schema and data**. The ledger tables already exist in production with synchronized data.

---

## Migration Strategy: CODE-ONLY DEPLOYMENT

Since schemas and data are already in sync, this migration **only involves deploying code** from `ledger-functionality` to `main`.

### Risk Level: **LOW** ✅

**Why Low Risk?**
1. No schema changes needed (tables already exist)
2. No data migration needed (already synchronized)
3. New UI routes don't affect existing functionality
4. New API routes are independent additions
5. Existing order/payment APIs only have additive changes

---

## Pre-Migration Checklist

### 1. Database Verification ✅

**Already Completed**:
- [x] Verified production has all ledger tables
- [x] Confirmed data counts match
- [x] Validated entry types are consistent

### 2. Code Review Tasks

**Before merging, verify**:
- [ ] All API routes have proper error handling
- [ ] Environment variables are production-ready
- [ ] No `.env.ledger` references in merged code
- [ ] All imports are correct
- [ ] TypeScript types are properly exported
- [ ] UI components are responsive

### 3. Testing Requirements

**Test on ledger branch before merge**:
- [ ] Create new order with advance payment → Verify ledger entry
- [ ] Add payment to existing order → Verify ledger entry
- [ ] Create manual ledger entry (miscellaneous) → Verify saved
- [ ] Edit manual entry → Verify updated
- [ ] Delete manual entry → Verify removed
- [ ] Sync order payments → Verify no duplicates
- [ ] Create vendor → Verify saved
- [ ] View vendor sub-ledger → Verify entries appear
- [ ] Search ledger by various filters → Verify results
- [ ] Test pagination → Verify correct page navigation

---

## Step-by-Step Migration Process

### Phase 1: Pre-Merge Preparation (1 hour)

#### Step 1.1: Backup Production Database
```bash
# Create timestamped backup
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
pg_dump $(grep "^DATABASE_URL=" .env | cut -d'=' -f2) \
  > "backups/pre_ledger_migration_$TIMESTAMP.sql"
```

#### Step 1.2: Create Feature Freeze Notice
- Notify team: "Ledger migration in progress - no order/payment edits for 30 minutes"
- Post maintenance window if public-facing

#### Step 1.3: Final Testing on Ledger Branch
```bash
# Switch to ledger environment
./switch-env.sh ledger

# Run the application
npm run dev

# Execute all test cases from section 3 above
```

---

### Phase 2: Code Merge (30 minutes)

#### Step 2.1: Update Main Branch
```bash
# Ensure main is up to date
git checkout main
git pull origin main
```

#### Step 2.2: Merge Ledger Branch
```bash
# Merge without fast-forward to preserve history
git merge --no-ff ledger-functionality

# If conflicts arise (unlikely), resolve carefully:
# - Keep both versions if both add new functionality
# - Preserve main's environment config
# - Accept ledger's new API routes and components
```

#### Step 2.3: Environment File Cleanup
```bash
# Verify .env uses production credentials (not ledger)
cat .env | grep DATABASE_URL

# Remove ledger-specific files (optional - they're gitignored)
rm .env.ledger
rm switch-env.sh
rm LEDGER_BRANCH_README.md
```

#### Step 2.4: Build and Type Check
```bash
# Verify TypeScript compiles
npm run build

# Check for type errors
npx tsc --noEmit
```

---

### Phase 3: Deployment (30 minutes)

#### Step 3.1: Deploy to Production
```bash
# Push to main
git push origin main

# If using Vercel/deployment platform, trigger build
# (or wait for auto-deploy)
```

#### Step 3.2: Verify Deployment
- [ ] Check build logs for errors
- [ ] Confirm deployment URL is live
- [ ] Verify environment variables are set correctly

#### Step 3.3: Smoke Testing (Production)
```bash
# Test critical paths:
1. Visit /dashboard → Should load normally
2. Visit /ledger → Should show existing 67 entries
3. Visit /vendors → Should show 2 existing vendors
4. Create test order with advance → Verify ledger entry appears
5. Add payment to test order → Verify ledger entry appears
6. Click "Sync Order Payments" → Verify no duplicates
7. View vendor sub-ledger → Verify entries display correctly
```

---

### Phase 4: Data Validation (15 minutes)

#### Step 4.1: Verify Entry Counts
```bash
# Run on production after deployment
psql $(grep "^DATABASE_URL=" .env | cut -d'=' -f2) << 'EOF'
-- Should still be 67 entries
SELECT COUNT(*) FROM general_ledger;

-- Should be 64 order payments
SELECT COUNT(*) FROM general_ledger WHERE entry_type = 'order_payment';

-- Check balance calculation
SELECT 
  SUM(credit) as total_credit,
  SUM(debit) as total_debit,
  SUM(credit) - SUM(debit) as balance
FROM general_ledger;
EOF
```

#### Step 4.2: Test Order Payment Sync
```bash
# In production UI:
1. Go to /ledger
2. Click "Sync Order Payments" button
3. Verify:
   - Entry count remains 67 (no duplicates)
   - Order payment entries remain 64
   - Balance calculation is correct
```

---

### Phase 5: Monitoring & Rollback Plan (24 hours)

#### Step 5.1: Monitor Application Logs
- Watch for any errors related to:
  - `/api/general-ledger/*` routes
  - `/api/vendors/*` routes
  - `/api/vendor-ledger` route
  - Order creation with payments
  - Payment addition

#### Step 5.2: Rollback Procedure (If Needed)
```bash
# If critical issues arise:

# 1. Revert code
git revert HEAD  # Reverts the merge commit
git push origin main

# 2. Restore database (if data corruption occurred)
psql $(grep "^DATABASE_URL=" .env | cut -d'=' -f2) \
  < "backups/pre_ledger_migration_$TIMESTAMP.sql"

# 3. Redeploy previous version
# (trigger build on hosting platform)
```

---

## Files Being Merged

### New Files (Will be added to main)

**API Routes**:
- `src/app/api/general-ledger/route.ts` - List & create entries
- `src/app/api/general-ledger/[id]/route.ts` - Get/update/delete entry
- `src/app/api/general-ledger/stats/route.ts` - Statistics
- `src/app/api/general-ledger/sync-payments/route.ts` - Sync all order payments
- `src/app/api/vendors/route.ts` - List & create vendors
- `src/app/api/vendors/[id]/route.ts` - Get/update/delete vendor
- `src/app/api/vendor-tags/route.ts` - List & create tags
- `src/app/api/vendor-tags/[id]/route.ts` - Delete tag
- `src/app/api/vendor-ledger/route.ts` - Vendor sub-ledger

**UI Components**:
- `src/components/forms/ledger-entry-form.tsx` - Entry form
- `src/components/dialogs/ledger-entry-dialog.tsx` - Entry dialog
- `src/components/forms/vendor-form.tsx` - Vendor form
- `src/components/dialogs/vendor-dialog.tsx` - Vendor dialog

**Pages**:
- `src/app/ledger/page.tsx` - General ledger dashboard
- `src/app/vendors/page.tsx` - Vendors list
- `src/app/vendors/[id]/page.tsx` - Vendor sub-ledger

**Documentation** (optional to include):
- `LEDGER_BRANCH_README.md` - Branch documentation
- `.env.ledger.template` - Template (not used in main)
- `switch-env.sh` - Environment switcher (not used in main)

### Modified Files (Changes to existing files)

1. **`src/lib/supabase-client.ts`**
   - Adds: `LedgerEntryType`, `Vendor`, `VendorTag`, `GeneralLedger`, `VendorLedger` types
   - Adds: `GeneralLedgerWithRelations`, `VendorLedgerWithRelations`, `VendorWithLedger` types
   - **Impact**: Type-only additions, no breaking changes

2. **`src/app/api/orders/route.ts`**
   - Adds: Ledger entry creation when `advance_paid > 0`
   - **Impact**: New functionality, doesn't affect existing order creation

3. **`src/app/api/payments/route.ts`**
   - Adds: Ledger entry creation on new payment
   - **Impact**: New functionality, doesn't affect existing payment flow

4. **`src/components/dashboard/sidebar.tsx`**
   - Adds: "Ledger" and "Vendors" navigation items
   - **Impact**: UI addition only, no functionality changes

---

## Post-Migration Tasks

### Immediate (Day 1)
- [ ] Verify all 67 ledger entries display correctly
- [ ] Test creating new order with payment → Check ledger
- [ ] Test adding payment to order → Check ledger
- [ ] Document any issues in GitHub Issues

### Short-term (Week 1)
- [ ] Monitor user feedback on ledger UI
- [ ] Verify no duplicate entries being created
- [ ] Check balance calculations are accurate
- [ ] Test vendor sub-ledger with multiple entries

### Long-term (Month 1)
- [ ] Review ledger data integrity
- [ ] Optimize queries if performance issues
- [ ] Consider adding ledger reports/exports
- [ ] Train users on new functionality

---

## Success Criteria

✅ Merge is successful when:
1. No build errors after merge
2. All 67 existing ledger entries display correctly
3. New orders with payments create ledger entries
4. Manual entries can be created/edited/deleted
5. Vendor sub-ledgers display correctly
6. Sync order payments doesn't create duplicates
7. Balance calculations are accurate
8. No errors in production logs

---

## Rollback Criteria

❌ Rollback if any of these occur:
1. Critical errors preventing order creation
2. Data corruption in ledger entries
3. Duplicate entries being created uncontrollably
4. Balance calculations are incorrect
5. Application crashes on ledger routes
6. Database deadlocks or performance degradation

---

## Communication Plan

### Before Migration
**To**: Development team, stakeholders  
**Message**: "Ledger functionality deployment scheduled for [DATE] at [TIME]. Expected downtime: 0 minutes. Maintenance window: 30 minutes."

### During Migration
**To**: Development team  
**Updates**: 
- "Phase 1 complete: Backup created"
- "Phase 2 complete: Code merged"
- "Phase 3 complete: Deployed to production"
- "Phase 4 complete: Validation successful"

### After Migration
**To**: All users  
**Message**: "New ledger functionality is now live! You can now:
- View general ledger at /ledger
- Manage vendors at /vendors
- View vendor sub-ledgers
- Order payments are automatically tracked"

---

## Additional Notes

### Database Schema Status
- ✅ All tables exist: `general_ledger`, `vendor_ledger`, `vendors`, `vendor_tags`
- ✅ All columns match between environments
- ✅ Indexes and constraints are identical
- ✅ No migrations needed

### Data Synchronization Status
- ✅ Order payment entries: 64 (identical)
- ✅ Vendor payment entries: 2 (identical)
- ✅ Miscellaneous entries: 1 (identical)
- ✅ Vendors: 2 (identical)
- ✅ No sync needed

### Environment Variables
Current production `.env` already has correct `DATABASE_URL` pointing to production Supabase project. No changes needed.

### Dependency Changes
No new npm packages required. All functionality uses existing dependencies:
- Next.js
- React
- Supabase client
- Tailwind CSS
- shadcn/ui components

---

## Contact & Support

**Migration Lead**: [Your Name]  
**Escalation**: [Team Lead]  
**Rollback Authority**: [CTO/Engineering Manager]

**Emergency Contact During Migration**:
- Slack: #engineering-alerts
- Phone: [Emergency Number]

---

## Approval

- [ ] Code review completed
- [ ] Testing completed on ledger branch
- [ ] Database backup created
- [ ] Deployment window confirmed
- [ ] Rollback plan reviewed
- [ ] Stakeholders notified

**Approved by**: ___________________  
**Date**: ___________________  
**Deployment Date/Time**: ___________________

---

**END OF MIGRATION PLAN**
