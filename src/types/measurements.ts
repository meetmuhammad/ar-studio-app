import { z } from "zod";

// Measurement database type
export interface Measurement {
  id: string;
  customer_id: string;
  name: string;
  
  // Body measurements (in inches)
  chest?: number;
  waist?: number;
  hip?: number;
  sleeves?: number;
  biceps?: number;
  wrist?: number;
  neck?: number;
  shoulder?: number;
  cross_back?: number;
  open_coat_length?: number;
  coat_length?: number;
  sherwani_length?: number;
  kameez_length?: number;
  three_piece_waistcoat_length?: number;
  waistcoat_length?: number;
  pent_waist?: number;
  pent_length?: number;
  thigh?: number;
  knee?: number;
  bottom?: number;
  shoe_size?: number;
  turban_size?: number;
  
  // Metadata
  is_default: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
  
  // Relations
  customer?: {
    id: string;
    name: string;
    phone: string;
  };
}

// Measurement form data
export interface MeasurementFormData {
  customer_id: string;
  name: string;
  chest?: number;
  waist?: number;
  hip?: number;
  sleeves?: number;
  biceps?: number;
  wrist?: number;
  neck?: number;
  shoulder?: number;
  cross_back?: number;
  open_coat_length?: number;
  coat_length?: number;
  sherwani_length?: number;
  kameez_length?: number;
  three_piece_waistcoat_length?: number;
  waistcoat_length?: number;
  pent_waist?: number;
  pent_length?: number;
  thigh?: number;
  knee?: number;
  bottom?: number;
  shoe_size?: number;
  turban_size?: number;
  is_default?: boolean;
  notes?: string;
}

// Measurement validation schema
export const measurementSchema = z.object({
  customer_id: z.string().uuid("Please select a customer"),
  name: z.string().min(1, "Measurement name is required").max(255, "Name too long"),
  
  // Body measurements (optional, positive numbers only)
  chest: z.number().positive("Must be positive").max(100, "Must be under 100 inches").optional().or(z.literal("")),
  waist: z.number().positive("Must be positive").max(100, "Must be under 100 inches").optional().or(z.literal("")),
  hip: z.number().positive("Must be positive").max(100, "Must be under 100 inches").optional().or(z.literal("")),
  sleeves: z.number().positive("Must be positive").max(50, "Must be under 50 inches").optional().or(z.literal("")),
  biceps: z.number().positive("Must be positive").max(30, "Must be under 30 inches").optional().or(z.literal("")),
  wrist: z.number().positive("Must be positive").max(15, "Must be under 15 inches").optional().or(z.literal("")),
  neck: z.number().positive("Must be positive").max(30, "Must be under 30 inches").optional().or(z.literal("")),
  shoulder: z.number().positive("Must be positive").max(50, "Must be under 50 inches").optional().or(z.literal("")),
  cross_back: z.number().positive("Must be positive").max(50, "Must be under 50 inches").optional().or(z.literal("")),
  open_coat_length: z.number().positive("Must be positive").max(60, "Must be under 60 inches").optional().or(z.literal("")),
  coat_length: z.number().positive("Must be positive").max(60, "Must be under 60 inches").optional().or(z.literal("")),
  sherwani_length: z.number().positive("Must be positive").max(60, "Must be under 60 inches").optional().or(z.literal("")),
  kameez_length: z.number().positive("Must be positive").max(60, "Must be under 60 inches").optional().or(z.literal("")),
  three_piece_waistcoat_length: z.number().positive("Must be positive").max(50, "Must be under 50 inches").optional().or(z.literal("")),
  waistcoat_length: z.number().positive("Must be positive").max(50, "Must be under 50 inches").optional().or(z.literal("")),
  pent_waist: z.number().positive("Must be positive").max(60, "Must be under 60 inches").optional().or(z.literal("")),
  pent_length: z.number().positive("Must be positive").max(60, "Must be under 60 inches").optional().or(z.literal("")),
  thigh: z.number().positive("Must be positive").max(50, "Must be under 50 inches").optional().or(z.literal("")),
  knee: z.number().positive("Must be positive").max(30, "Must be under 30 inches").optional().or(z.literal("")),
  bottom: z.number().positive("Must be positive").max(30, "Must be under 30 inches").optional().or(z.literal("")),
  shoe_size: z.number().positive("Must be positive").max(20, "Must be under 20").optional().or(z.literal("")),
  turban_size: z.number().positive("Must be positive").max(50, "Must be under 50 inches").optional().or(z.literal("")),
  
  is_default: z.boolean().optional().default(false),
  notes: z.string().max(1000, "Notes too long").optional(),
});

export type MeasurementFormValues = z.infer<typeof measurementSchema>;

// Measurement fields definition for forms - organized by categories
export const MEASUREMENT_FIELDS = [
  // Upper Body Measurements
  { key: 'chest' as const, label: 'Chest', description: 'Around the fullest part of the chest', category: 'Upper Body' },
  { key: 'waist' as const, label: 'Waist', description: 'Around the narrowest part of the waist', category: 'Upper Body' },
  { key: 'hip' as const, label: 'Hip', description: 'Around the fullest part of the hips', category: 'Upper Body' },
  { key: 'sleeves' as const, label: 'Sleeves', description: 'Sleeve length measurement', category: 'Upper Body' },
  { key: 'biceps' as const, label: 'Biceps', description: 'Around the largest part of the upper arm', category: 'Upper Body' },
  { key: 'wrist' as const, label: 'Wrist', description: 'Around the wrist bone', category: 'Upper Body' },
  { key: 'neck' as const, label: 'Neck', description: 'Around the base of the neck', category: 'Upper Body' },
  { key: 'shoulder' as const, label: 'Shoulder', description: 'Shoulder width measurement', category: 'Upper Body' },
  { key: 'cross_back' as const, label: 'Cross Back', description: 'Cross back width measurement', category: 'Upper Body' },
  
  // Length Measurements
  { key: 'open_coat_length' as const, label: 'Open Coat Length', description: 'Open coat length measurement', category: 'Length' },
  { key: 'coat_length' as const, label: 'Coat Length', description: 'Coat length measurement', category: 'Length' },
  { key: 'sherwani_length' as const, label: 'Sherwani Length', description: 'Sherwani length measurement', category: 'Length' },
  { key: 'kameez_length' as const, label: 'Kameez Length', description: 'Kameez length measurement', category: 'Length' },
  { key: 'three_piece_waistcoat_length' as const, label: 'Three Piece Waistcoat Length', description: 'Three piece waistcoat length measurement', category: 'Length' },
  { key: 'waistcoat_length' as const, label: 'Waistcoat Length', description: 'Waistcoat length measurement', category: 'Length' },
  
  // Lower Body Measurements
  { key: 'pent_waist' as const, label: 'Pent Waist', description: 'Pant waist measurement', category: 'Lower Body' },
  { key: 'pent_length' as const, label: 'Pent Length', description: 'Pant length measurement', category: 'Lower Body' },
  { key: 'thigh' as const, label: 'Thigh', description: 'Around the largest part of the thigh', category: 'Lower Body' },
  { key: 'knee' as const, label: 'Knee', description: 'Around the knee cap', category: 'Lower Body' },
  { key: 'bottom' as const, label: 'Bottom', description: 'Bottom hem measurement', category: 'Lower Body' },
  
  // Accessories
  { key: 'shoe_size' as const, label: 'Shoe Size', description: 'Shoe size', category: 'Accessories' },
  { key: 'turban_size' as const, label: 'Turban Size', description: 'Turban size measurement', category: 'Accessories' },
] as const;

export type MeasurementField = typeof MEASUREMENT_FIELDS[number]['key'];