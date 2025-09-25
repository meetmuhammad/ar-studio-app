-- Add payment fields to orders table
ALTER TABLE orders
ADD COLUMN total_amount DECIMAL(10,2),
ADD COLUMN advance_paid DECIMAL(10,2),
ADD COLUMN balance DECIMAL(10,2),
ADD COLUMN payment_method VARCHAR(20) CHECK (payment_method IN ('cash', 'bank', 'other'));

-- Add constraint to ensure advance_paid doesn't exceed total_amount
ALTER TABLE orders
ADD CONSTRAINT check_advance_not_exceed_total 
CHECK (advance_paid IS NULL OR total_amount IS NULL OR advance_paid <= total_amount);

-- Make delivery_date NOT NULL (was optional before)
-- First, update any existing NULL delivery_dates with a default value
UPDATE orders 
SET delivery_date = booking_date 
WHERE delivery_date IS NULL;

-- Now make it NOT NULL
ALTER TABLE orders 
ALTER COLUMN delivery_date SET NOT NULL;