-- Create measurements table
CREATE TABLE IF NOT EXISTS public.measurements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL DEFAULT 'Default Measurements',
    
    -- Body measurements (in inches)
    chest DECIMAL(5,2),
    waist DECIMAL(5,2),
    hip DECIMAL(5,2),
    shoulder_width DECIMAL(5,2),
    arm_length DECIMAL(5,2),
    bicep DECIMAL(5,2),
    neck DECIMAL(5,2),
    wrist DECIMAL(5,2),
    thigh DECIMAL(5,2),
    inseam DECIMAL(5,2),
    outseam DECIMAL(5,2),
    knee DECIMAL(5,2),
    calf DECIMAL(5,2),
    ankle DECIMAL(5,2),
    back_length DECIMAL(5,2),
    front_length DECIMAL(5,2),
    
    -- Metadata
    is_default BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes
CREATE INDEX idx_measurements_customer_id ON public.measurements(customer_id);
CREATE INDEX idx_measurements_is_default ON public.measurements(customer_id, is_default);

-- Enable RLS
ALTER TABLE public.measurements ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Enable read access for all users" ON public.measurements
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON public.measurements
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users only" ON public.measurements
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users only" ON public.measurements
    FOR DELETE USING (auth.role() = 'authenticated');

-- Create updated_at trigger
CREATE TRIGGER update_measurements_updated_at
    BEFORE UPDATE ON public.measurements
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Add measurement_id to orders table (nullable for backward compatibility)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS measurement_id UUID REFERENCES public.measurements(id) ON DELETE SET NULL;

-- Create index for orders measurement_id
CREATE INDEX IF NOT EXISTS idx_orders_measurement_id ON public.orders(measurement_id);