"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FileText, Check } from "lucide-react"
import { format } from "date-fns"
import type { Measurement } from "@/types/measurements"
import type { OrderWithCustomer } from "@/lib/supabase-client"
import { openMeasurementPrintPreview } from "@/lib/print-utils"

interface MeasurementSelectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  measurements: Measurement[]
  order: OrderWithCustomer
}

export function MeasurementSelectDialog({
  open,
  onOpenChange,
  measurements,
  order,
}: MeasurementSelectDialogProps) {
  const handleSelectMeasurement = (measurement: Measurement) => {
    openMeasurementPrintPreview({ order, measurement })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Select Measurement to Print
          </DialogTitle>
          <DialogDescription>
            Choose which measurement set you want to print for {order.customers.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {measurements.map((measurement) => {
            const isLinked = order.measurement_id === measurement.id
            const measurementCount = Object.entries(measurement)
              .filter(([key, value]) => 
                key !== 'id' && key !== 'customer_id' && key !== 'name' && 
                key !== 'is_default' && key !== 'notes' && key !== 'created_at' && 
                key !== 'updated_at' && key !== 'customer' && 
                value !== null && value !== undefined
              ).length

            return (
              <Card 
                key={measurement.id} 
                className={`cursor-pointer hover:border-primary transition-colors ${
                  isLinked ? 'border-primary ring-2 ring-primary/20' : ''
                }`}
                onClick={() => handleSelectMeasurement(measurement)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-semibold text-lg">{measurement.name}</span>
                        {isLinked && (
                          <Badge variant="default" className="text-xs">
                            <Check className="h-3 w-3 mr-1" />
                            Linked to Order
                          </Badge>
                        )}
                        {measurement.is_default && (
                          <Badge variant="secondary" className="text-xs">
                            Default
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                        <span>📏 {measurementCount} measurements</span>
                        <span>📅 {format(new Date(measurement.created_at), "MMM d, yyyy")}</span>
                      </div>

                      {measurement.notes && (
                        <div className="text-sm text-muted-foreground italic mt-2">
                          Note: {measurement.notes}
                        </div>
                      )}
                    </div>

                    <Button 
                      variant={isLinked ? "default" : "outline"}
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleSelectMeasurement(measurement)
                      }}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Print
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}

          {measurements.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No measurements found for this customer</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
