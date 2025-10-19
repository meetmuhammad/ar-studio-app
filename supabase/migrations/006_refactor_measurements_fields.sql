-- Refactor measurements table with correct tailoring fields
-- Drop old columns and add new ones according to requirements

-- Remove old measurement columns
ALTER TABLE public.measurements 
DROP COLUMN IF EXISTS shoulder_width,
DROP COLUMN IF EXISTS arm_length,
DROP COLUMN IF EXISTS bicep,
DROP COLUMN IF EXISTS inseam,
DROP COLUMN IF EXISTS outseam,
DROP COLUMN IF EXISTS calf,
DROP COLUMN IF EXISTS ankle,
DROP COLUMN IF EXISTS back_length,
DROP COLUMN IF EXISTS front_length;

-- Add new measurement columns with correct names
ALTER TABLE public.measurements 
ADD COLUMN sleeves DECIMAL(5,2),
ADD COLUMN biceps DECIMAL(5,2), -- Note: biceps not bicep
ADD COLUMN shoulder DECIMAL(5,2),
ADD COLUMN cross_back DECIMAL(5,2),
ADD COLUMN open_coat_length DECIMAL(5,2),
ADD COLUMN coat_length DECIMAL(5,2),
ADD COLUMN sherwani_length DECIMAL(5,2),
ADD COLUMN kameez_length DECIMAL(5,2),
ADD COLUMN three_piece_waistcoat_length DECIMAL(5,2),
ADD COLUMN waistcoat_length DECIMAL(5,2),
ADD COLUMN pent_waist DECIMAL(5,2),
ADD COLUMN pent_length DECIMAL(5,2), -- Note: pent not pant
ADD COLUMN bottom DECIMAL(5,2),
ADD COLUMN shoe_size DECIMAL(5,2),
ADD COLUMN turban_size DECIMAL(5,2);

-- Comment on the table for documentation
COMMENT ON TABLE public.measurements IS 'Customer measurements for tailoring with proper field names';

-- Add comments for new fields
COMMENT ON COLUMN public.measurements.sleeves IS 'Sleeve length measurement';
COMMENT ON COLUMN public.measurements.biceps IS 'Biceps circumference measurement';
COMMENT ON COLUMN public.measurements.shoulder IS 'Shoulder width measurement';
COMMENT ON COLUMN public.measurements.cross_back IS 'Cross back width measurement';
COMMENT ON COLUMN public.measurements.open_coat_length IS 'Open coat length measurement';
COMMENT ON COLUMN public.measurements.coat_length IS 'Coat length measurement';
COMMENT ON COLUMN public.measurements.sherwani_length IS 'Sherwani length measurement';
COMMENT ON COLUMN public.measurements.kameez_length IS 'Kameez length measurement';
COMMENT ON COLUMN public.measurements.three_piece_waistcoat_length IS 'Three piece waistcoat length measurement';
COMMENT ON COLUMN public.measurements.waistcoat_length IS 'Waistcoat length measurement';
COMMENT ON COLUMN public.measurements.pent_waist IS 'Pant waist measurement';
COMMENT ON COLUMN public.measurements.pent_length IS 'Pant length measurement';
COMMENT ON COLUMN public.measurements.bottom IS 'Bottom hem measurement';
COMMENT ON COLUMN public.measurements.shoe_size IS 'Shoe size';
COMMENT ON COLUMN public.measurements.turban_size IS 'Turban size measurement';