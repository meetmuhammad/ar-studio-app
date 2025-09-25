-- Demo users SQL script
-- Run this in Supabase SQL Editor to create demo users

-- Note: This creates user records but you'll need to create auth users through Supabase Auth
-- OR enable email signup and use the sign-in form to create accounts

-- Insert demo user profiles (these will be linked when auth users are created)
INSERT INTO users (id, email, name, role) VALUES 
  ('admin-demo-id', 'admin@example.com', 'Admin User', 'admin'),
  ('staff-demo-id', 'staff@example.com', 'Staff User', 'staff')
ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name,
  role = EXCLUDED.role;

-- Alternative: If you want to use Supabase Auth API directly
-- You'll need to enable Email auth in your Supabase project settings:
-- 1. Go to Authentication > Settings
-- 2. Make sure "Enable email confirmations" is disabled for development
-- 3. Then use the sign-in form to create accounts with:
--    - admin@example.com / admin123
--    - staff@example.com / staff123