-- AR Studio Performance Indexes
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- These are safe to run multiple times (IF NOT EXISTS)

-- Orders indexes (most queried table)
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_booking_date ON orders(booking_date);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- General ledger indexes
CREATE INDEX IF NOT EXISTS idx_general_ledger_entry_type ON general_ledger(entry_type);
CREATE INDEX IF NOT EXISTS idx_general_ledger_entry_date ON general_ledger(entry_date);
CREATE INDEX IF NOT EXISTS idx_general_ledger_vendor_id ON general_ledger(vendor_id);
CREATE INDEX IF NOT EXISTS idx_general_ledger_order_id ON general_ledger(order_id);

-- Payments indexes
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments(customer_id);

-- Measurements indexes
CREATE INDEX IF NOT EXISTS idx_measurements_customer_id ON measurements(customer_id);

-- Vendor ledger indexes
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_vendor_id ON vendor_ledger(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_general_ledger_id ON vendor_ledger(general_ledger_id);

-- Customer indexes (phone is likely already unique-indexed, but just in case)
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- Order items index
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
