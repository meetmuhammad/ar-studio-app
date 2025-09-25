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

### 2. Supabase Setup

1. **Create a Supabase Project**:
   - Go to [supabase.com](https://supabase.com)
   - Create a new project
   - Note your project URL and anon key

2. **Update Environment Variables**:
   Update the `.env` file with your Supabase credentials:

   ```env
   # Supabase Database URL (replace [YOUR-PASSWORD] with your actual password)
   DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.drdnqsjjxmqiklwfadmk.supabase.co:5432/postgres"
   
   # Supabase Configuration (replace with your actual values)
   NEXT_PUBLIC_SUPABASE_URL="https://drdnqsjjxmqiklwfadmk.supabase.co"
   NEXT_PUBLIC_SUPABASE_ANON_KEY="your_anon_key_here"
   
   # NextAuth
   NEXTAUTH_SECRET="changeme"
   NEXTAUTH_URL="http://localhost:3000"
   ```

   You can find these values in your Supabase dashboard under Settings > API.

3. **Create Database Schema**:
   - Go to your Supabase dashboard
   - Navigate to SQL Editor
   - Copy and paste the contents of `supabase-schema.sql`
   - Run the script to create all tables, functions, and policies

### 3. Seed the Database (Optional)

To add sample data, you'll need the service role key from Supabase:

1. Add to your `.env` file:
   ```env
   SUPABASE_SERVICE_ROLE_KEY="your_service_role_key_here"
   ```

2. Run the seed script:
   ```bash
   npm run seed
   ```

   This creates:
   - 20 sample customers with realistic data
   - 30 sample orders with various measurements
   - Proper order number sequence (AR-00001, AR-00002, etc.)

### 4. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the dashboard.

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

### Vercel (Recommended)

1. Push to GitHub
2. Import project in Vercel
3. Add all environment variables from your `.env` file
4. Deploy

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
