# Role-Based Access Control (RBAC) Implementation

## Overview
This document describes the implementation of a two-role access control system with **Admin** and **Staff** roles.

## User Roles

### 1. Admin Role
- **Email**: ahsantariq1991@gmail.com
- **Password**: Admin@1234 (should be changed after first login)
- **Access**: Full access to all features
  - Dashboard
  - Customers
  - Orders
  - Measurements
  - Ledger (General Ledger)
  - Vendors
  - Add New Orders
  - Add New Payments

### 2. Staff Role
- **Email**: ahsantariq.ar@gmail.com
- **Access**: Limited access to operational features
  - Customers
  - Orders
  - Measurements
  - Add New Orders
  - Add New Payments
- **No Access**: Dashboard, Ledger, Vendors

## Setup Instructions

### Step 1: Run the Role Setup Script

```bash
npm run setup-roles
```

This script will:
1. Update `ahsantariq.ar@gmail.com` to **Staff** role
2. Create new admin user `ahsantariq1991@gmail.com` with **Admin** role

### Step 2: Verify the Setup

1. Sign in with the staff account (ahsantariq.ar@gmail.com)
2. Verify that only Customers, Orders, Measurements are visible in the sidebar
3. Sign out and sign in with the admin account (ahsantariq1991@gmail.com / Admin@1234)
4. Verify that all menu items are visible

### Step 3: Change Admin Password (Recommended)

After first login with the admin account, change the password through your Supabase dashboard or implement a password change feature.

## Implementation Details

### 1. Database Schema
The `users` table already has a `role` column:
```sql
role user_role DEFAULT 'staff'
```

### 2. Authentication Context (`src/contexts/auth-context.tsx`)
- Modified to fetch user role from the database
- The `createAuthUser` function now queries the `users` table to get the actual role

### 3. Role-Based Navigation (`src/components/dashboard/sidebar.tsx`)
- Each navigation item has a `roles` array specifying which roles can access it
- Navigation items are filtered based on the current user's role
- Admin can see all items, Staff can only see Customers, Orders, and Measurements

### 4. Page Protection (`src/components/auth/role-guard.tsx`)
- Created `RoleGuard` component for protecting pages
- Admin-only pages (Dashboard, Ledger, Vendors) are wrapped with `<RoleGuard allowedRoles={['admin']}>`
- Redirects unauthorized users to `/customers` (default redirect for staff)

### 5. Protected Pages
The following pages are protected with `RoleGuard`:
- `/` (Dashboard) - Admin only
- `/ledger` (General Ledger) - Admin only
- `/vendors` (Vendors List) - Admin only
- `/vendors/[id]` (Vendor Detail) - Admin only

### 6. API Route Protection (`src/lib/api-auth.ts`)
Created utility functions for protecting API routes:
- `getAuthUser(request)` - Get authenticated user with role
- `requireRole(request, allowedRoles)` - Require specific roles
- `requireAdmin(request)` - Shorthand for admin-only routes
- `requireAuth(request)` - Require any authenticated user

#### Usage Example:
```typescript
// In API route file (e.g., /api/general-ledger/route.ts)
import { requireAdmin } from '@/lib/api-auth'
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  // Protect the route
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) {
    return authResult // Return error response
  }
  
  // Continue with authorized request
  const { user } = authResult
  // ... rest of your code
}
```

### 7. Admin-Only API Routes (To Be Protected)
The following API routes should be protected with `requireAdmin`:
- `/api/general-ledger` (all methods)
- `/api/general-ledger/[id]` (all methods)
- `/api/general-ledger/stats`
- `/api/general-ledger/sync-payments`
- `/api/vendor-ledger` (all methods)
- `/api/vendors` (all methods)
- `/api/vendors/[id]` (all methods)
- `/api/vendor-tags` (all methods)
- `/api/stats` (GET - dashboard stats)

### 8. Shared Access API Routes (Protected with `requireAuth`)
The following API routes should be accessible to both Admin and Staff:
- `/api/customers` (all methods)
- `/api/orders` (all methods)
- `/api/measurements` (all methods)
- `/api/payments` (all methods)

## Security Features

### Frontend Protection
1. **Navigation Filtering**: Staff users don't see admin-only menu items
2. **Route Guards**: Admin-only pages redirect staff users to `/customers`
3. **Visual Feedback**: Loading states during role verification

### Backend Protection
1. **API Middleware**: All API routes should use `requireAdmin` or `requireAuth`
2. **Role Verification**: User role is fetched from database on every request
3. **Error Responses**: 
   - 401 Unauthorized: Not signed in
   - 403 Forbidden: Insufficient permissions

## File Structure

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── page.tsx                    # Dashboard (Admin only)
│   │   ├── customers/
│   │   │   └── page.tsx                # Customers (Both)
│   │   ├── orders/
│   │   │   └── page.tsx                # Orders (Both)
│   │   ├── measurements/
│   │   │   └── page.tsx                # Measurements (Both)
│   │   ├── ledger/
│   │   │   └── page.tsx                # Ledger (Admin only)
│   │   └── vendors/
│   │       ├── page.tsx                # Vendors (Admin only)
│   │       └── [id]/page.tsx           # Vendor Detail (Admin only)
│   └── api/
│       ├── general-ledger/             # Admin only APIs
│       ├── vendor-ledger/              # Admin only APIs
│       ├── vendors/                    # Admin only APIs
│       └── customers, orders, etc.     # Shared APIs
├── components/
│   ├── auth/
│   │   ├── route-guard.tsx             # Authentication guard
│   │   └── role-guard.tsx              # Role-based page guard
│   └── dashboard/
│       ├── sidebar.tsx                 # Role-filtered navigation
│       └── header.tsx                  # Header with actions
├── contexts/
│   └── auth-context.tsx                # Auth context with role
├── lib/
│   └── api-auth.ts                     # API route protection utilities
└── scripts/
    └── setup-user-roles.ts             # Role setup script
```

## Testing Checklist

### Staff User Testing (ahsantariq.ar@gmail.com)
- [ ] Can access Customers page
- [ ] Can access Orders page  
- [ ] Can access Measurements page
- [ ] Can create new orders
- [ ] Can add new payments
- [ ] Cannot see Dashboard in sidebar
- [ ] Cannot see Ledger in sidebar
- [ ] Cannot see Vendors in sidebar
- [ ] Gets redirected when trying to access `/` (dashboard)
- [ ] Gets redirected when trying to access `/ledger`
- [ ] Gets redirected when trying to access `/vendors`

### Admin User Testing (ahsantariq1991@gmail.com)
- [ ] Can access all pages
- [ ] Can see all menu items in sidebar
- [ ] Can create new orders
- [ ] Can add new payments
- [ ] Can access Dashboard
- [ ] Can access Ledger
- [ ] Can access Vendors
- [ ] Can manage vendor bills
- [ ] Role badge shows "admin" in sidebar

## Future Enhancements

1. **Password Change Feature**: Allow users to change their password
2. **User Management UI**: Admin interface to manage users and roles
3. **Audit Logging**: Track who performed what actions
4. **More Granular Permissions**: Per-feature permissions instead of just roles
5. **API Route Protection**: Apply the `requireAdmin` middleware to all admin-only API routes
6. **Session Management**: Add session timeout and refresh token logic

## Troubleshooting

### Issue: User role not updating after running script
**Solution**: Clear browser cache and sign out/sign in again

### Issue: Staff user can still access admin pages
**Solution**: Ensure RoleGuard component is properly wrapping the page content

### Issue: API returns 401 even when signed in
**Solution**: Check that Supabase session is valid and user exists in the users table

### Issue: Role showing as 'staff' for admin user
**Solution**: Verify the role was updated in the database using the setup script

## Support

For issues or questions, please check:
1. Database: Verify user roles in the `users` table
2. Console: Check browser console for authentication errors
3. Network: Check API responses for 401/403 errors
4. Logs: Check server logs for database query errors
