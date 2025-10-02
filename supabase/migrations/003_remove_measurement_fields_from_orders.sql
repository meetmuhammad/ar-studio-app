-- Remove measurement fields from orders table
-- These are now stored in the separate measurements table

ALTER TABLE public.orders 
DROP COLUMN IF EXISTS chest,
DROP COLUMN IF EXISTS waist,
DROP COLUMN IF EXISTS hips,
DROP COLUMN IF EXISTS sleeves,
DROP COLUMN IF EXISTS neck,
DROP COLUMN IF EXISTS shoulder,
DROP COLUMN IF EXISTS cross_back,
DROP COLUMN IF EXISTS biceps,
DROP COLUMN IF EXISTS wrist,
DROP COLUMN IF EXISTS coat_length,
DROP COLUMN IF EXISTS three_piece_waistcoat,
DROP COLUMN IF EXISTS waistcoat_length,
DROP COLUMN IF EXISTS sherwani_length,
DROP COLUMN IF EXISTS pant_waist,
DROP COLUMN IF EXISTS pant_length,
DROP COLUMN IF EXISTS thigh,
DROP COLUMN IF EXISTS knee,
DROP COLUMN IF EXISTS bottom,
DROP COLUMN IF EXISTS shoe_size,
DROP COLUMN IF EXISTS turban_length,
DROP COLUMN IF EXISTS fitting_preferences;