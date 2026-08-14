# AR Dashboard - Customer & Order Management System

A production-ready Next.js dashboard for managing **Customers** and **Orders/Bookings** with search, CRUD operations, and detailed measurement fields. Built with **Supabase**, **App Router**, **shadcn/ui**, **TanStack Table**, and **react-hook-form + zod**.

## 🚀 Tech Stack

- **Framework**: Next.js 15 (App Router, TypeScript)
- **Database**: Supabase (PostgreSQL)
- **UI**: TailwindCSS + shadcn/ui, lucide-react icons
- **Tables**: TanStack Table (server-side pagination, sorting, filtering)
- **Forms**: react-hook-form + zod validation
- **State Management**: Next.js Server Actions & API Routes
- **Authentication**: Supabase Auth (ready for admin/staff roles)

## 📋 Features

### 🧑‍💼 Customer Management
- Create, read, update, delete customers
- Search by name or phone number
- Unique phone number validation
- Order count tracking
- Paginated customer list with sorting

### 📦 Order Management
- Order creation with auto-generated numbers (AR-00001, AR-00002, etc.)
- Complete measurement system (20+ body measurements)
- Customer selection with inline customer creation
- Date-based filtering (booking/delivery dates)
- Comments and fitting preferences
- Search by order number or customer details
- Prevent customer deletion if they have orders

### 📊 Advanced Features
- Server-side pagination and sorting
- Real-time search with debouncing
- CSV export functionality
- Responsive design
- Form validation with helpful error messages
- Modal-based CRUD operations

## 🛠️ Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the local database

```bash
npx supabase start
```

This runs Postgres in Docker and applies every migration in `supabase/migrations/`.
It prints an API URL, an anon key and a service-role key.

### 3. Configure environment

```bash
cp .env.example .env.local
```

Paste the three values printed by `supabase start` into `.env.local`.

Confirm what you are pointed at before doing anything else:

```bash
npm run env:check
```

### 4. Seed synthetic data

```bash
npm run seed          # 60 customers, 80 orders, 181 ledger entries
npm run create-users  # admin@staging.local / staff@staging.local
```

These scripts refuse to run against production. See `docs/ENVIRONMENTS.md`.

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with
`admin@staging.local` / `staging-admin-pw`.

---

## 🗄 Schema changes

The Supabase SQL Editor is **not** part of this workflow. Schema lives in
`supabase/migrations/` and is the single source of truth.

```bash
npm run db:new add_something   # new migration file
npm run db:reset               # replay all migrations from zero, locally
```

Every migration must be safe to apply while the currently deployed code is still
running — see the expand/contract rule in
**[docs/ENVIRONMENTS.md](docs/ENVIRONMENTS.md)**.

## 📁 Database Schema

The application uses the following main tables:

- **customers**: Customer information (name, phone, address)
- **orders**: Order details with measurements and customer relationships
- **counters**: Atomic counter for order number generation
- **users**: User accounts with role-based access (admin/staff)

## 🔧 Development Commands

```bash
npm run dev     # Start development server
npm run build   # Build for production
npm run start   # Start production server
npm run lint    # Run ESLint
npm run seed    # Seed database with sample data
```

## 🚀 Deployment

```
feature/*  --PR-->  staging  --PR + approval-->  main
    |                  |                           |
    | CI: replay       | migrations -> staging     | migrations -> PRODUCTION
    |     migrations,  | Vercel staging deploy     | Vercel production deploy
    |     lint, types, |                           |
    |     guards, tests|                           |
```

Migrations are applied by GitHub Actions, never from a laptop. Production is
gated behind a manual approval in the `production` GitHub Environment.

Full detail: **[docs/ENVIRONMENTS.md](docs/ENVIRONMENTS.md)**.

## 📋 API Endpoints

- **Customers**: `/api/customers` (GET, POST), `/api/customers/[id]` (GET, PATCH, DELETE)
- **Orders**: `/api/orders` (GET, POST), `/api/orders/[id]` (GET, PATCH, DELETE)

All endpoints support pagination, sorting, and filtering.

## 🎨 Features Overview

- **Dashboard**: Overview with quick stats and navigation
- **Customer Management**: Full CRUD with search and pagination
- **Order Management**: Complex forms with measurements, date pickers
- **Data Tables**: Server-side pagination with TanStack Table
- **Forms**: Validated forms with react-hook-form and zod
- **Authentication Ready**: Supabase auth integration prepared
- **Export**: CSV export functionality for orders
- **Responsive**: Mobile-friendly design

## 🔍 Key Components

- Atomic order number generation (AR-XXXXX format)
- Customer selection with inline creation
- Comprehensive measurement fields for tailoring
- Date-based filtering and search
- Role-based access control (admin/staff)

---

**Built with Next.js 15, Supabase, and modern React patterns for production use.**
