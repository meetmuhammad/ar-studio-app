-- Create payments table to track all payment transactions
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    
    -- Payment details
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('cash', 'bank', 'card', 'online', 'other')),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Transaction reference (for bank transfers, card payments, etc.)
    transaction_reference VARCHAR(100),
    
    -- Notes for additional details
    notes TEXT,
   
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Who recorded this payment (references users table)
    recorded_by UUID REFERENCES public.users(id)
);

-- Create indexes for better query performance
CREATE INDEX idx_payments_order_id ON public.payments(order_id);
CREATE INDEX idx_payments_customer_id ON public.payments(customer_id);
CREATE INDEX idx_payments_payment_date ON public.payments(payment_date);
CREATE INDEX idx_payments_recorded_by ON public.payments(recorded_by);

-- Enable RLS
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Enable read access for authenticated users" ON public.payments
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users only" ON public.payments
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users only" ON public.payments
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users only" ON public.payments
    FOR DELETE USING (auth.role() = 'authenticated');

-- Create updated_at trigger
CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON public.payments
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Add helpful comment
COMMENT ON TABLE public.payments IS 'Tracks all payment transactions for orders, allowing multiple payments per order';
COMMENT ON COLUMN public.payments.amount IS 'Payment amount in currency (positive values only)';
COMMENT ON COLUMN public.payments.payment_method IS 'Method used for payment: cash, bank, card, online, other';
COMMENT ON COLUMN public.payments.transaction_reference IS 'Reference number for bank/card transactions';
COMMENT ON COLUMN public.payments.recorded_by IS 'User who recorded this payment entry';