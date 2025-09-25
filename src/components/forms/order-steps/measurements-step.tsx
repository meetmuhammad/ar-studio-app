"use client"

import { useFormContext } from "react-hook-form"
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form"
import { Textarea } from "@/components/ui/textarea"
import { MeasurementField, measurementSections } from "@/components/forms/measurement-field"
import { CreateOrderInput } from "@/lib/validators"

export function OrderMeasurementsStep() {
  const form = useFormContext<CreateOrderInput>()

  return (
    <div className="space-y-6">
      {/* Measurement Sections */}
      <div className="space-y-8">
        {Object.entries(measurementSections).map(([key, section]) => (
          <div key={key}>
            <h3 className="text-lg font-medium mb-4">{section.title}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {section.fields.map((field) => (
                <MeasurementField
                  key={field.name}
                  control={form.control}
                  name={field.name as keyof CreateOrderInput}
                  label={field.label}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Fitting Preferences */}
      <div>
        <FormField
          control={form.control}
          name="fittingPreferences"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fitting Preferences</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="Add any specific fitting preferences, style notes, or special requirements..."
                  rows={4}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="bg-muted/50 p-4 rounded-lg">
        <h4 className="font-medium text-sm mb-2">Step 2: Measurements</h4>
        <p className="text-sm text-muted-foreground">
          Enter the customer&apos;s measurements in centimeters. All measurements are optional, 
          but providing accurate measurements ensures a perfect fit. Don&apos;t forget to add any 
          specific fitting preferences or style notes.
        </p>
      </div>
    </div>
  )
}