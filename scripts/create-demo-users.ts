import { createAdminSupabaseClient } from '../src/lib/supabase'

const supabase = createAdminSupabaseClient()

async function createDemoUsers() {
  console.log('🔐 Creating demo users...')

  try {
    // Create admin user
    const { data: adminAuthUser, error: adminAuthError } = await supabase.auth.admin.createUser({
      email: 'admin@example.com',
      password: 'admin123',
      email_confirm: true,
      user_metadata: {
        full_name: 'Admin User'
      }
    })

    if (adminAuthError) {
      console.error('Error creating admin auth user:', adminAuthError)
    } else {
      console.log('✅ Created admin auth user:', adminAuthUser.user.email)

      // Create admin profile
      const { error: adminProfileError } = await supabase
        .from('users')
        .upsert({
          id: adminAuthUser.user.id,
          email: adminAuthUser.user.email,
          name: 'Admin User',
          role: 'admin'
        })

      if (adminProfileError) {
        console.error('Error creating admin profile:', adminProfileError)
      } else {
        console.log('✅ Created admin profile')
      }
    }

    // Create staff user
    const { data: staffAuthUser, error: staffAuthError } = await supabase.auth.admin.createUser({
      email: 'staff@example.com',
      password: 'staff123',
      email_confirm: true,
      user_metadata: {
        full_name: 'Staff User'
      }
    })

    if (staffAuthError) {
      console.error('Error creating staff auth user:', staffAuthError)
    } else {
      console.log('✅ Created staff auth user:', staffAuthUser.user.email)

      // Create staff profile
      const { error: staffProfileError } = await supabase
        .from('users')
        .upsert({
          id: staffAuthUser.user.id,
          email: staffAuthUser.user.email,
          name: 'Staff User',
          role: 'staff'
        })

      if (staffProfileError) {
        console.error('Error creating staff profile:', staffProfileError)
      } else {
        console.log('✅ Created staff profile')
      }
    }

    console.log('\n🎉 Demo users created successfully!')
    console.log('👤 Admin: admin@example.com / admin123')
    console.log('👤 Staff: staff@example.com / staff123')

  } catch (error) {
    console.error('❌ Error creating demo users:', error)
  }
}

createDemoUsers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })