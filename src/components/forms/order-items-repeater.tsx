"use client"

import { useState } from "react"
import { useFieldArray, Control } from "react-hook-form"
import { Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { CreateOrderInput, OrderItem } from "@/lib/validators"

const ORDER_TYPES = [
  { value: "nikkah", label: "Nikkah" },
  { value: "mehndi", label: "Mehndi" },
  { value: "barat", label: "Barat" },
  { value: "wallima", label: "Wallima" },
  { value: "other", label: "Other" },
] as const

interface OrderItemsRepeaterProps {
  control: Control<CreateOrderInput>
  disabled?: boolean
}

export function OrderItemsRepeater({ control, disabled }: OrderItemsRepeaterProps) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "orderItems",
  })

  const addOrderItem = () => {
    if (fields.length < 4) {
      append({
        order_type: "other",
        description: "",
      })
    }
  }

  const removeOrderItem = (index: number) => {
    remove(index)
  }

  // Get already selected order types to disable them in other dropdowns
  const getUsedOrderTypes = (currentIndex: number) => {
    return fields
      .map((field, index) => {
        if (index === currentIndex) return null
        const fieldValue = control._getWatch(`orderItems.${index}.order_type`)
        return fieldValue
      })
      .filter(Boolean)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Order Items</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addOrderItem}
            disabled={disabled || fields.length >= 4}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Item ({fields.length}/4)
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <p className="text-sm">No order items added yet.</p>
            <p className="text-xs mt-1">Click "Add Item" to get started.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {fields.map((field, index) => {
              const usedOrderTypes = getUsedOrderTypes(index)
              
              return (
                <div key={field.id} className="relative border border-border rounded-lg p-4 bg-card">
                  <div className="flex items-start justify-between mb-4">
                    <h4 className="text-sm font-medium text-card-foreground">
                      Item #{index + 1}
                    </h4>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeOrderItem(index)}
                      disabled={disabled}
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Order Type Selection */}
                    <FormField
                      control={control}
                      name={`orderItems.${index}.order_type`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Order Type *</FormLabel>
                          <FormControl>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                              disabled={disabled}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                              <SelectContent>
                                {ORDER_TYPES.map((type) => {
                                  const isUsed = usedOrderTypes.includes(type.value)
                                  return (
                                    <SelectItem
                                      key={type.value}
                                      value={type.value}
                                      disabled={isUsed}
                                      className={isUsed ? "opacity-50" : ""}
                                    >
                                      {type.label}
                                      {isUsed && " (Already used)"}
                                    </SelectItem>
                                  )
                                })}
                              </SelectContent>
                            </Select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Description */}
                    <FormField
                      control={control}
                      name={`orderItems.${index}.description`}
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>Description *</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Enter detailed description..."
                              className="resize-none min-h-[80px]"
                              {...field}
                              disabled={disabled}
                              style={{ 
                                whiteSpace: "pre-wrap",
                                fontFamily: "inherit"
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
        
        {fields.length < 4 && (
          <div className="text-center pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={addOrderItem}
              disabled={disabled}
              className="w-full border-dashed border-2 border-border h-12 text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Another Order Item
            </Button>
          </div>
        )}

        {fields.length >= 4 && (
          <div className="text-center p-3 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg">
            <p className="text-sm text-orange-800 dark:text-orange-200">
              Maximum of 4 order items reached
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}