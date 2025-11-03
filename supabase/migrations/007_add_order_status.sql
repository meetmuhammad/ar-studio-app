-- Add order status field to orders table
-- Migration: 007_add_order_status.sql

-- Create enum type for order status
CREATE TYPE order_status AS ENUM ('In Process', 'Delivered', 'Cancelled');

-- Add status column to orders table with default value 'In Process'
ALTER TABLE orders 
ADD COLUMN status order_status DEFAULT 'In Process' NOT NULL;

-- Create index on status for better query performance
CREATE INDEX idx_orders_status ON orders(status);

-- Create index on delivery_date for sorting
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders(delivery_date);
