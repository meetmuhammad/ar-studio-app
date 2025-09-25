"use client"

import { Input } from "@/components/ui/input"
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Control, FieldPath, FieldValues } from "react-hook-form"

interface MeasurementFieldProps<T extends FieldValues> {
  control: Control<T>
  name: FieldPath<T>
  label: string
  placeholder?: string
  disabled?: boolean
  unit?: string
}

export function MeasurementField<T extends FieldValues>({
  control,
  name,
  label,
  placeholder = "0.0",
  disabled = false,
  unit = "cm",
}: MeasurementFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="text-xs text-muted-foreground">{label}</FormLabel>
          <FormControl>
            <div className="relative">
              <Input
                type="number"
                step="0.1"
                min="0"
                max="999.9"
                placeholder={placeholder}
                disabled={disabled}
                {...field}
                value={field.value || ""}
                onChange={(e) => {
                  const value = e.target.value
                  field.onChange(value ? parseFloat(value) : undefined)
                }}
                className="pr-8"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                <span className="text-xs text-muted-foreground">{unit}</span>
              </div>
            </div>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

// Measurement sections for organization
export const measurementSections = {
  upper: {
    title: "Upper Body",
    fields: [
      { name: "chest", label: "Chest" },
      { name: "waist", label: "Waist" },
      { name: "hips", label: "Hips" },
      { name: "shoulder", label: "Shoulder" },
      { name: "crossBack", label: "Cross Back" },
      { name: "neck", label: "Neck" },
    ]
  },
  arms: {
    title: "Arms",
    fields: [
      { name: "sleeves", label: "Sleeves" },
      { name: "biceps", label: "Biceps" },
      { name: "wrist", label: "Wrist" },
    ]
  },
  coats: {
    title: "Coat & Jacket",
    fields: [
      { name: "coatLength", label: "Coat Length" },
      { name: "threePieceWaistcoat", label: "3-Piece Waistcoat" },
      { name: "waistcoatLength", label: "Waistcoat Length" },
      { name: "sherwaniLength", label: "Sherwani Length" },
    ]
  },
  lower: {
    title: "Lower Body",
    fields: [
      { name: "pantWaist", label: "Pant Waist" },
      { name: "pantLength", label: "Pant Length" },
      { name: "thigh", label: "Thigh" },
      { name: "knee", label: "Knee" },
      { name: "bottom", label: "Bottom" },
    ]
  },
  accessories: {
    title: "Accessories",
    fields: [
      { name: "shoeSize", label: "Shoe Size" },
      { name: "turbanLength", label: "Turban Length" },
    ]
  }
}