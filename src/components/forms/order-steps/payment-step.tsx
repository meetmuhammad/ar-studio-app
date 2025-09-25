"use client"

import { useFormContext } from "react-hook-form"
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Calculator, Banknote, CreditCard, Wallet } from "lucide-react"
import { CreateOrderInput } from "@/lib/validators"

export function OrderPaymentStep() {
  const form = useFormContext<CreateOrderInput>()

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  return (
    <div className="space-y-6">
      {/* Payment Method */}
      <div>
        <FormField
          control={form.control}
          name="paymentMethod"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Payment Method</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  className="grid grid-cols-3 gap-4"
                >
                  <div className="flex items-center space-x-2 border rounded-lg p-3 hover:bg-accent">
                    <RadioGroupItem value="cash" id="cash" />
                    <Label htmlFor="cash" className="flex items-center gap-2 cursor-pointer">
                      <Banknote className="h-4 w-4" />
                      Cash
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 border rounded-lg p-3 hover:bg-accent">
                    <RadioGroupItem value="bank" id="bank" />
                    <Label htmlFor="bank" className="flex items-center gap-2 cursor-pointer">
                      <CreditCard className="h-4 w-4" />
                      Bank Transfer
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 border rounded-lg p-3 hover:bg-accent">
                    <RadioGroupItem value="other" id="other" />
                    <Label htmlFor="other" className="flex items-center gap-2 cursor-pointer">
                      <Wallet className="h-4 w-4" />
                      Other
                    </Label>
                  </div>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* Payment Amounts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Amount */}
        <FormField
          control={form.control}
          name="totalAmount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Total *</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="20000"
                    {...field}
                    value={field.value || ''}
                    onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                    className="pr-12"
                  />
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground text-sm font-medium">
                    PKR
                  </div>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Advance Amount */}
        <FormField
          control={form.control}
          name="advancePaid"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Advance *</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="10000"
                    {...field}
                    value={field.value || ''}
                    onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                    className="pr-12"
                  />
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground text-sm font-medium">
                    PKR
                  </div>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Balance Amount */}
        <FormField
          control={form.control}
          name="balance"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Balance (Calculated)</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    {...field}
                    value={field.value !== undefined ? field.value.toFixed(2) : ''}
                    readOnly
                    className="pr-12 bg-muted cursor-not-allowed"
                  />
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground text-sm font-medium">
                    PKR
                  </div>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>


      <div className="bg-muted/50 p-4 rounded-lg">
        <h4 className="font-medium text-sm mb-2">Step 3: Payment Details</h4>
        <p className="text-sm text-muted-foreground">
          Set the payment method and enter payment amounts. Choose the payment method, 
          enter the total order amount and advance payment received. The balance will be calculated automatically.
        </p>
      </div>
    </div>
  )
}