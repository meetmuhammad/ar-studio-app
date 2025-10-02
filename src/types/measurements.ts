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
  shoulder_width?: number;
  arm_length?: number;
  bicep?: number;
  neck?: number;
  wrist?: number;
  thigh?: number;
  inseam?: number;
  outseam?: number;
  knee?: number;
  calf?: number;
  ankle?: number;
  back_length?: number;
  front_length?: number;
  
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
  shoulder_width?: number;
  arm_length?: number;
  bicep?: number;
  neck?: number;
  wrist?: number;
  thigh?: number;
  inseam?: number;
  outseam?: number;
  knee?: number;
  calf?: number;
  ankle?: number;
  back_length?: number;
  front_length?: number;
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
  shoulder_width: z.number().positive("Must be positive").max(50, "Must be under 50 inches").optional().or(z.literal("")),
  arm_length: z.number().positive("Must be positive").max(50, "Must be under 50 inches").optional().or(z.literal("")),
  bicep: z.number().positive("Must be positive").max(30, "Must be under 30 inches").optional().or(z.literal("")),
  neck: z.number().positive("Must be positive").max(30, "Must be under 30 inches").optional().or(z.literal("")),
  wrist: z.number().positive("Must be positive").max(15, "Must be under 15 inches").optional().or(z.literal("")),
  thigh: z.number().positive("Must be positive").max(50, "Must be under 50 inches").optional().or(z.literal("")),
  inseam: z.number().positive("Must be positive").max(50, "Must be under 50 inches").optional().or(z.literal("")),
  outseam: z.number().positive("Must be positive").max(60, "Must be under 60 inches").optional().or(z.literal("")),
  knee: z.number().positive("Must be positive").max(30, "Must be under 30 inches").optional().or(z.literal("")),
  calf: z.number().positive("Must be positive").max(30, "Must be under 30 inches").optional().or(z.literal("")),
  ankle: z.number().positive("Must be positive").max(20, "Must be under 20 inches").optional().or(z.literal("")),
  back_length: z.number().positive("Must be positive").max(50, "Must be under 50 inches").optional().or(z.literal("")),
  front_length: z.number().positive("Must be positive").max(50, "Must be under 50 inches").optional().or(z.literal("")),
  
  is_default: z.boolean().optional().default(false),
  notes: z.string().max(1000, "Notes too long").optional(),
});

export type MeasurementFormValues = z.infer<typeof measurementSchema>;

// Measurement fields definition for forms
export const MEASUREMENT_FIELDS = [
  { key: 'chest' as const, label: 'Chest', description: 'Around the fullest part of the chest' },
  { key: 'waist' as const, label: 'Waist', description: 'Around the narrowest part of the waist' },
  { key: 'hip' as const, label: 'Hip', description: 'Around the fullest part of the hips' },
  { key: 'shoulder_width' as const, label: 'Shoulder Width', description: 'From shoulder point to shoulder point' },
  { key: 'arm_length' as const, label: 'Arm Length', description: 'From shoulder to wrist' },
  { key: 'bicep' as const, label: 'Bicep', description: 'Around the largest part of the upper arm' },
  { key: 'neck' as const, label: 'Neck', description: 'Around the base of the neck' },
  { key: 'wrist' as const, label: 'Wrist', description: 'Around the wrist bone' },
  { key: 'thigh' as const, label: 'Thigh', description: 'Around the largest part of the thigh' },
  { key: 'inseam' as const, label: 'Inseam', description: 'From crotch to ankle (inside leg)' },
  { key: 'outseam' as const, label: 'Outseam', description: 'From waist to ankle (outside leg)' },
  { key: 'knee' as const, label: 'Knee', description: 'Around the knee cap' },
  { key: 'calf' as const, label: 'Calf', description: 'Around the largest part of the calf' },
  { key: 'ankle' as const, label: 'Ankle', description: 'Around the ankle bone' },
  { key: 'back_length' as const, label: 'Back Length', description: 'From neck to waist (back)' },
  { key: 'front_length' as const, label: 'Front Length', description: 'From neck to waist (front)' },
] as const;

export type MeasurementField = typeof MEASUREMENT_FIELDS[number]['key'];