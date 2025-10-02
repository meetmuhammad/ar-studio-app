-- Seed measurements data for existing customers
-- Note: Run this after running the measurements migration

-- Get customer IDs first (replace with actual IDs from your database)
DO $$
DECLARE
    customer_ammar_id UUID;
    customer_sarah_id UUID;
    customer_mike_id UUID;
BEGIN
    -- Get customer IDs (adjust names as needed)
    SELECT id INTO customer_ammar_id FROM public.customers WHERE name = 'Ammar Ilyas' LIMIT 1;
    SELECT id INTO customer_sarah_id FROM public.customers WHERE name = 'Sarah Johnson' LIMIT 1;
    SELECT id INTO customer_mike_id FROM public.customers WHERE name = 'Mike Wilson' LIMIT 1;

    -- Insert measurements for Ammar Ilyas (if customer exists)
    IF customer_ammar_id IS NOT NULL THEN
        INSERT INTO public.measurements (
            customer_id,
            name,
            chest,
            waist,
            hip,
            shoulder_width,
            arm_length,
            bicep,
            neck,
            wrist,
            thigh,
            inseam,
            outseam,
            knee,
            calf,
            ankle,
            back_length,
            front_length,
            is_default,
            notes
        ) VALUES (
            customer_ammar_id,
            'Standard Measurements',
            40.0,  -- chest
            32.0,  -- waist
            38.0,  -- hip
            18.0,  -- shoulder_width
            24.0,  -- arm_length
            13.5,  -- bicep
            15.5,  -- neck
            7.0,   -- wrist
            22.0,  -- thigh
            32.0,  -- inseam
            42.0,  -- outseam
            14.0,  -- knee
            15.0,  -- calf
            9.0,   -- ankle
            17.0,  -- back_length
            16.0,  -- front_length
            true,
            'Standard measurements for formal wear'
        );
    END IF;

    -- Insert measurements for Sarah Johnson (if customer exists)
    IF customer_sarah_id IS NOT NULL THEN
        INSERT INTO public.measurements (
            customer_id,
            name,
            chest,
            waist,
            hip,
            shoulder_width,
            arm_length,
            bicep,
            neck,
            wrist,
            thigh,
            inseam,
            outseam,
            knee,
            calf,
            ankle,
            back_length,
            front_length,
            is_default,
            notes
        ) VALUES (
            customer_sarah_id,
            'Default Measurements',
            36.0,  -- chest
            26.0,  -- waist
            38.0,  -- hip
            15.0,  -- shoulder_width
            22.0,  -- arm_length
            11.0,  -- bicep
            13.0,  -- neck
            6.0,   -- wrist
            20.0,  -- thigh
            30.0,  -- inseam
            40.0,  -- outseam
            13.0,  -- knee
            13.5,  -- calf
            8.0,   -- ankle
            15.0,  -- back_length
            14.5,  -- front_length
            true,
            'Standard measurements'
        );
    END IF;

    -- Insert measurements for Mike Wilson (if customer exists)
    IF customer_mike_id IS NOT NULL THEN
        INSERT INTO public.measurements (
            customer_id,
            name,
            chest,
            waist,
            hip,
            shoulder_width,
            arm_length,
            bicep,
            neck,
            wrist,
            thigh,
            inseam,
            outseam,
            knee,
            calf,
            ankle,
            back_length,
            front_length,
            is_default,
            notes
        ) VALUES (
            customer_mike_id,
            'Standard Measurements',
            44.0,  -- chest
            36.0,  -- waist
            40.0,  -- hip
            19.0,  -- shoulder_width
            25.0,  -- arm_length
            15.0,  -- bicep
            16.5,  -- neck
            7.5,   -- wrist
            24.0,  -- thigh
            34.0,  -- inseam
            44.0,  -- outseam
            15.0,  -- knee
            16.0,  -- calf
            9.5,   -- ankle
            18.0,  -- back_length
            17.0,  -- front_length
            true,
            'Standard measurements for business wear'
        );
    END IF;

END $$;