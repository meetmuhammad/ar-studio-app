"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { CustomerCombobox } from "@/components/combobox/customer-combobox";
import { Measurement, measurementSchema, MeasurementFormValues, MEASUREMENT_FIELDS } from "@/types/measurements";
import { Customer } from "@/lib/supabase-client";
import { toast } from "sonner";

interface MeasurementFormProps {
  measurement?: Measurement;
  onSubmit: (data: MeasurementFormValues) => Promise<void>;
  onCancel: () => void;
  customers: Customer[];
  isLoading?: boolean;
  hideCustomerField?: boolean;
}

export function MeasurementForm({
  measurement,
  onSubmit,
  onCancel,
  customers,
  isLoading = false,
  hideCustomerField = false,
}: MeasurementFormProps) {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const form = useForm<MeasurementFormValues>({
    resolver: zodResolver(measurementSchema) as any,
    mode: "onTouched",
    defaultValues: {
      customer_id: measurement?.customer_id || "",
      name: measurement?.name || "Default Measurements",
      chest: measurement?.chest || undefined,
      waist: measurement?.waist || undefined,
      hip: measurement?.hip || undefined,
      shoulder_width: measurement?.shoulder_width || undefined,
      arm_length: measurement?.arm_length || undefined,
      bicep: measurement?.bicep || undefined,
      neck: measurement?.neck || undefined,
      wrist: measurement?.wrist || undefined,
      thigh: measurement?.thigh || undefined,
      inseam: measurement?.inseam || undefined,
      outseam: measurement?.outseam || undefined,
      knee: measurement?.knee || undefined,
      calf: measurement?.calf || undefined,
      ankle: measurement?.ankle || undefined,
      back_length: measurement?.back_length || undefined,
      front_length: measurement?.front_length || undefined,
      is_default: measurement?.is_default ?? false,
      notes: measurement?.notes || "",
    },
  });

  // Set selected customer on load
  useEffect(() => {
    if (measurement?.customer_id && customers && customers.length > 0) {
      const customer = customers.find(c => c.id === measurement.customer_id);
      if (customer) {
        setSelectedCustomer(customer);
        console.log('Set selected customer:', customer);
      } else {
        console.log('Customer not found for ID:', measurement.customer_id);
      }
    }
  }, [measurement, customers]);

  // Auto-set customer name when preselected customer is available
  useEffect(() => {
    if (measurement?.customer_id && !measurement.name && selectedCustomer && !form.getValues('name')) {
      form.setValue('name', `${selectedCustomer.name} - Standard Measurements`);
    }
  }, [selectedCustomer, measurement, form]);

  const handleSubmit = async (data: MeasurementFormValues) => {
    try {
      console.log('Form submitting with data:', data);
      console.log('Selected customer:', selectedCustomer);
      await onSubmit(data);
      // Don't show toast here - let the parent handle it
    } catch (error) {
      console.error("Error submitting measurement:", error);
      toast.error("Failed to save measurement");
      throw error; // Re-throw to prevent dialog from closing
    }
  };

  const handleCustomerSelect = (customer: Customer | null) => {
    setSelectedCustomer(customer);
    form.setValue("customer_id", customer?.id || "");
    
    // Auto-generate name if creating new measurement
    if (!measurement && customer) {
      form.setValue("name", `${customer.name} - Standard Measurements`);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Customer and Basic Info */}
        <div className="space-y-4">
          {!hideCustomerField && (
            <div className="space-y-2">
              <Label htmlFor="customer">Customer *</Label>
              <CustomerCombobox
                value={selectedCustomer?.id || ""}
                onValueChange={(customerId) => {
                  const customer = customers.find(c => c.id === customerId)
                  handleCustomerSelect(customer || null)
                }}
                disabled={isLoading}
              />
              {form.formState.errors.customer_id && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.customer_id.message}
                </p>
              )}
            </div>
          )}
          
          {hideCustomerField && selectedCustomer && (
            <div className="p-3 bg-muted/30 rounded-lg">
              <div className="text-sm text-muted-foreground">Customer</div>
              <div className="font-medium">{selectedCustomer.name}</div>
              <div className="text-sm text-muted-foreground">{selectedCustomer.phone}</div>
            </div>
          )}

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Measurement Set Name *</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    placeholder="e.g., Formal Wear Measurements"
                    disabled={isLoading}
                  />
                </FormControl>
                <FormDescription>
                  Give this measurement set a descriptive name
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="is_default"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={isLoading}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Set as Default</FormLabel>
                  <FormDescription>
                    Mark this as the default measurement set for this customer
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />
        </div>

        {/* Measurements Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Body Measurements</h3>
            <div className="text-sm text-muted-foreground">All measurements in inches</div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {MEASUREMENT_FIELDS.map((field) => (
              <FormField
                key={field.key}
                control={form.control}
                name={field.key}
                render={({ fieldState, field: formField }) => (
                  <FormItem>
                    <FormLabel>{field.label}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max={field.key.includes('shoulder') || field.key.includes('arm') || field.key.includes('length') || field.key.includes('seam') ? "60" : 
                             field.key.includes('chest') || field.key.includes('waist') || field.key.includes('hip') || field.key.includes('thigh') ? "100" :
                             field.key.includes('neck') || field.key.includes('bicep') || field.key.includes('knee') || field.key.includes('calf') ? "30" :
                             field.key.includes('wrist') || field.key.includes('ankle') ? "20" : "100"}
                        placeholder="0.0"
                        {...formField}
                        value={formField.value || ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          formField.onChange(value === "" ? undefined : parseFloat(value));
                        }}
                        onWheel={(e) => e.currentTarget.blur()}
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      {field.description}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </div>
        </div>

        {/* Notes */}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="Additional notes about these measurements..."
                  disabled={isLoading}
                  rows={3}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Actions */}
        <div className="flex justify-end space-x-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving..." : measurement ? "Update Measurement" : "Create Measurement"}
          </Button>
        </div>
      </form>
    </Form>
  );
}