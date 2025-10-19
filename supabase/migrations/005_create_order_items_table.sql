-- Create order_items table migration
-- This table stores multiple order items for each order with specific types and descriptions

-- Create enum for order types
CREATE TYPE order_type_enum AS ENUM ('nikkah', 'mehndi', 'barat', 'wallima', 'other');

-- Create order_items table
CREATE TABLE order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  order_type order_type_enum NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure each order can have at most one item per order type
  UNIQUE(order_id, order_type)
);

-- Create indexes for performance
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_order_type ON order_items(order_type);

-- Add updated_at trigger
CREATE TRIGGER update_order_items_updated_at
  BEFORE UPDATE ON order_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS for order_items
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users
CREATE POLICY "Enable all operations for authenticated users" ON order_items
  FOR ALL USING (auth.role() = 'authenticated');

-- Add comment for documentation
COMMENT ON TABLE order_items IS 'Stores individual order items with types (nikkah, mehndi, barat, wallima, other) and descriptions';
COMMENT ON COLUMN order_items.order_type IS 'Type of order item - each order can have max one of each type';
COMMENT ON COLUMN order_items.description IS 'Detailed description of the order item, preserving formatting';