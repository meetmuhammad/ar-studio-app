-- Supabase schema setup
-- Run these commands in the Supabase SQL Editor

-- Create custom types
CREATE TYPE user_role AS ENUM ('admin', 'staff');

-- Create customers table
CREATE TABLE customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create orders table
CREATE TABLE orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number VARCHAR(20) UNIQUE NOT NULL,
  customer_id UUID REFERENCES customers(id) NOT NULL,
  booking_date DATE NOT NULL,
  delivery_date DATE,
  comments TEXT,
  
  -- Measurement fields (in cm or inches, stored as DECIMAL(6,2))
  chest DECIMAL(6,2),
  waist DECIMAL(6,2),
  hips DECIMAL(6,2),
  sleeves DECIMAL(6,2),
  neck DECIMAL(6,2),
  shoulder DECIMAL(6,2),
  cross_back DECIMAL(6,2),
  biceps DECIMAL(6,2),
  wrist DECIMAL(6,2),
  coat_length DECIMAL(6,2),
  three_piece_waistcoat DECIMAL(6,2),
  waistcoat_length DECIMAL(6,2),
  sherwani_length DECIMAL(6,2),
  pant_waist DECIMAL(6,2),
  pant_length DECIMAL(6,2),
  thigh DECIMAL(6,2),
  knee DECIMAL(6,2),
  bottom DECIMAL(6,2),
  shoe_size DECIMAL(6,2),
  turban_length DECIMAL(6,2),
  
  fitting_preferences TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create counter table for order number generation
CREATE TABLE counters (
  id INTEGER PRIMARY KEY DEFAULT 1,
  value INTEGER DEFAULT 0,
  CONSTRAINT single_counter CHECK (id = 1)
);

-- Insert initial counter record
INSERT INTO counters (id, value) VALUES (1, 0);

-- Create users table (extends Supabase auth.users)
CREATE TABLE users (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(100),
  role user_role DEFAULT 'staff',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create function to atomically increment counter
CREATE OR REPLACE FUNCTION increment_counter(counter_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
  new_value INTEGER;
BEGIN
  UPDATE counters 
  SET value = value + 1 
  WHERE id = counter_id 
  RETURNING value INTO new_value;
  
  RETURN new_value;
END;
$$ LANGUAGE plpgsql;

-- Create indexes for performance
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_name ON customers(name);
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_orders_booking_date ON orders(booking_date);
CREATE INDEX idx_orders_created_at ON orders(created_at);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE counters ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users (you can customize based on role)
CREATE POLICY "Enable all operations for authenticated users" ON customers
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Enable all operations for authenticated users" ON orders
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Enable all operations for authenticated users" ON users
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Enable all operations for authenticated users" ON counters
  FOR ALL USING (auth.role() = 'authenticated');

-- Function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create user record on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();