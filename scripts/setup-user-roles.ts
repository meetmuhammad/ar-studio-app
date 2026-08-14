// Load environment variables. .env.local wins, matching Next.js.
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(__dirname, '../.env.local') })
config({ path: resolve(__dirname, '../.env') })

import { createClient } from '@supabase/supabase-js'
import { requireNonProduction } from './lib/env-guard'

// Default-deny. Exits(1) unless the target is LOCAL or STAGING.
// NOTE: this script hardcodes a real person's email address (see below). It was
// written to be run against production by hand. It must not be, ever again.
requireNonProduction('setup-user-roles')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('❌ Missing required environment variables:')
  console.error('   - NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗')
  console.error('   - SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceRoleKey ? '✓' : '✗')
  console.error('\nPlease ensure your .env file contains these variables.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function setupUserRoles() {
  console.log('🔐 Setting up user roles...\n')

  try {
    // 1. Update existing user to staff role
    console.log('📝 Updating ahsantariq.ar@gmail.com to staff role...')
    
    // First, get the auth user by email
    const { data: existingUser, error: getUserError } = await supabase.auth.admin.listUsers()
    
    if (getUserError) {
      console.error('Error listing users:', getUserError)
      return
    }

    const ahsanUser = existingUser.users.find(u => u.email === 'ahsantariq.ar@gmail.com')
    
    if (ahsanUser) {
      // Update the user profile to staff role
      const { error: updateError } = await supabase
        .from('users')
        .upsert({
          id: ahsanUser.id,
          email: ahsanUser.email,
          name: 'Ahsan Tariq',
          role: 'staff'
        })

      if (updateError) {
        console.error('Error updating user to staff:', updateError)
      } else {
        console.log('✅ Updated ahsantariq.ar@gmail.com to staff role')
      }
    } else {
      console.log('⚠️  User ahsantariq.ar@gmail.com not found in auth users')
    }

    // 2. Create new admin user
    console.log('\n📝 Creating new admin user ahsantariq1991@gmail.com...')
    
    const { data: adminAuthUser, error: adminAuthError } = await supabase.auth.admin.createUser({
      email: 'ahsantariq1991@gmail.com',
      password: 'Admin@1234', // Strong default password - should be changed on first login
      email_confirm: true,
      user_metadata: {
        full_name: 'Ahsan Tariq (Admin)'
      }
    })

    if (adminAuthError) {
      if (adminAuthError.message.includes('already registered')) {
        console.log('⚠️  User ahsantariq1991@gmail.com already exists')
        
        // Try to update the existing user's role
        const existingAdminUser = existingUser.users.find(u => u.email === 'ahsantariq1991@gmail.com')
        if (existingAdminUser) {
          const { error: updateAdminError } = await supabase
            .from('users')
            .upsert({
              id: existingAdminUser.id,
              email: existingAdminUser.email,
              name: 'Ahsan Tariq (Admin)',
              role: 'admin'
            })

          if (updateAdminError) {
            console.error('Error updating existing admin user role:', updateAdminError)
          } else {
            console.log('✅ Updated ahsantariq1991@gmail.com to admin role')
          }
        }
      } else {
        console.error('Error creating admin auth user:', adminAuthError)
      }
    } else {
      console.log('✅ Created admin auth user:', adminAuthUser.user.email)

      // Create admin profile
      const { error: adminProfileError } = await supabase
        .from('users')
        .upsert({
          id: adminAuthUser.user.id,
          email: adminAuthUser.user.email,
          name: 'Ahsan Tariq (Admin)',
          role: 'admin'
        })

      if (adminProfileError) {
        console.error('Error creating admin profile:', adminProfileError)
      } else {
        console.log('✅ Created admin profile')
      }
    }

    console.log('\n🎉 User roles setup completed successfully!')
    console.log('\n👤 Staff User: ahsantariq.ar@gmail.com')
    console.log('   - Access: Customers, Orders, Measurements, Add Payments')
    console.log('\n👤 Admin User: ahsantariq1991@gmail.com / Admin@1234')
    console.log('   - Access: Full access to all features')
    console.log('\n⚠️  Please change the admin password after first login!')

  } catch (error) {
    console.error('❌ Error setting up user roles:', error)
  }
}

setupUserRoles()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
