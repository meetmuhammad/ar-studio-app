# Ledger Branch - Development Guide

This branch is dedicated to implementing the ledger functionality for the AR App. It uses a separate Supabase database to avoid affecting production data.

## Branch Information

- **Branch Name**: `ledger-functionality`
- **Purpose**: Implement ledger/accounting features
- **Database**: Separate Supabase project (development/dummy database)

## Setup Instructions

### 1. Configure Ledger Database

Create your local `.env.ledger` file with dummy Supabase credentials:

```bash
# Copy the template file
cp .env.ledger.template .env.ledger

# Edit .env.ledger and replace the placeholders:
# - [YOUR-LEDGER-PROJECT] - Your Supabase project reference ID
# - [YOUR-LEDGER-PASSWORD] - Your database password  
# - [YOUR-LEDGER-ANON-KEY] - Your project's anon/public key
# - [YOUR-LEDGER-SERVICE-ROLE-KEY] - Your project's service role key
```

You can find these values in your Supabase project settings:
- Go to: Project Settings → API
- Copy: URL, anon key, and service_role key
- Database password: Project Settings → Database

**Note**: `.env.ledger` is gitignored and will NOT be committed to the repository.

### 2. Switch to Ledger Environment

Use the provided script to switch between environments:

```bash
# Switch to ledger (development) database
./switch-env.sh ledger

# Switch back to production database
./switch-env.sh production

# Check current environment
./switch-env.sh
```

**Important**: Restart your development server after switching environments!

### 3. Environment Files

- `.env` - Active environment (gitignored, NOT committed)
- `.env.production` - Production database credentials (gitignored, NOT committed)
- `.env.ledger` - Ledger/development database credentials (gitignored, NOT committed)
- `.env.ledger.template` - Template file (committed to repo, no credentials)
- `switch-env.sh` - Environment switching script (committed to repo)

## Development Workflow

1. **Start Development**:
   ```bash
   git checkout ledger-functionality
   ./switch-env.sh ledger
   npm run dev
   ```

2. **Make Changes**:
   - Implement ledger features
   - Test with dummy database
   - No risk to production data

3. **Before Committing**:
   ```bash
   # Ensure you're on the right branch
   git branch
   
   # Stage and commit your changes
   git add .
   git commit -m "feat: add ledger functionality"
   ```

4. **Switch Back to Production**:
   ```bash
   git checkout main
   ./switch-env.sh production
   ```

## Ledger Features to Implement

- [ ] Customer ledger/account tracking
- [ ] Payment history and transactions
- [ ] Outstanding balance tracking
- [ ] Payment reminders
- [ ] Financial reports
- [ ] Transaction logs

## Database Schema

The ledger functionality will likely require new tables:
- `ledger_entries` - Individual transactions
- `account_balances` - Current balance per customer
- `payment_history` - Payment records

## Testing

When testing ledger features:
1. Ensure you're using `.env.ledger` (dummy database)
2. Create test customers and transactions
3. Verify calculations and reports
4. Test edge cases

## Merging to Main

Before merging this branch to main:
1. Complete all feature implementation
2. Test thoroughly with dummy database
3. Update production database schema if needed
4. Create database migration scripts
5. Document any breaking changes
6. Get approval from team/stakeholders

## Safety Notes

⚠️ **Important Safety Measures**:
- Always verify which environment you're using before making changes
- Never commit `.env` files to git (they're gitignored)
- Keep `.env.production` safe - it contains production credentials
- Test all features thoroughly on dummy database first
- Document any schema changes needed for production

## Need Help?

Run `./switch-env.sh` without arguments to check your current environment.
