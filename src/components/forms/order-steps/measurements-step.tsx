"use client"

import { useState, useEffect } from "react"
import { useFormContext } from "react-hook-form"
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
// Note: MeasurementField is no longer used in orders - measurements are stored separately
import { CreateOrderInput } from "@/lib/validators"
import { Measurement, MEASUREMENT_FIELDS } from "@/types/measurements"
import { Star, Ruler, Plus, RefreshCw } from "lucide-react"
import { toast } from "sonner"

export function OrderMeasurementsStep() {
  const form = useFormContext<CreateOrderInput>()
  const [measurements, setMeasurements] = useState<Measurement[]>([])
  const [selectedMeasurement, setSelectedMeasurement] = useState<Measurement | null>(null)
  const [loading, setLoading] = useState(false)
  
  const customerId = form.watch("customerId")

  // Fetch measurements when customer changes
  useEffect(() => {
    if (customerId) {
      fetchCustomerMeasurements(customerId)
    } else {
      setMeasurements([])
      setSelectedMeasurement(null)
    }
  }, [customerId])

  // Refresh measurements when window gains focus (user returns from measurements page)
  useEffect(() => {
    const handleFocus = () => {
      if (customerId) {
        fetchCustomerMeasurements(customerId)
      }
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [customerId])

  const fetchCustomerMeasurements = async (customerId: string, showSuccessToast: boolean = false) => {
    try {
      setLoading(true)
      const response = await fetch(`/api/measurements?customer_id=${customerId}`)
      if (!response.ok) throw new Error('Failed to fetch measurements')
      
      const data = await response.json()
      setMeasurements(data.measurements)
      
      if (showSuccessToast && data.measurements.length > 0) {
        toast.success(`Found ${data.measurements.length} measurement(s) for this customer`)
      }
      
      // Auto-select default measurement if available, otherwise select first one
      const defaultMeasurement = data.measurements.find((m: Measurement) => m.is_default)
      const measurementToSelect = defaultMeasurement || data.measurements[0]
      
      if (measurementToSelect) {
        setSelectedMeasurement(measurementToSelect)
        loadMeasurementsIntoForm(measurementToSelect)
      } else {
        // Clear selection if no measurements found
        setSelectedMeasurement(null)
        form.setValue("measurementId", undefined)
      }
    } catch (error) {
      console.error('Error fetching measurements:', error)
      toast.error('Failed to load customer measurements')
    } finally {
      setLoading(false)
    }
  }

  const loadMeasurementsIntoForm = (measurement: Measurement) => {
    // Store the measurement ID in the form for order creation
    form.setValue("measurementId", measurement.id)
  }

  const handleMeasurementSelect = (measurementId: string) => {
    const measurement = measurements.find(m => m.id === measurementId)
    if (measurement) {
      setSelectedMeasurement(measurement)
      loadMeasurementsIntoForm(measurement)
      // Save the measurement ID to the form for order creation
      form.setValue("measurementId", measurementId)
      toast.success(`Loaded measurements: ${measurement.name}`)
    }
  }

  const clearMeasurements = () => {
    // Clear the measurement ID
    form.setValue("measurementId", undefined)
    setSelectedMeasurement(null)
    toast.success('Cleared selected measurements')
  }


  return (
    <div className="space-y-6">
      {/* Saved Measurements Selection */}
      {customerId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ruler className="h-5 w-5" />
                Select Saved Measurements
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchCustomerMeasurements(customerId, true)}
                disabled={loading}
                className="h-8 w-8 p-0"
                title="Refresh measurements"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="text-center py-4 text-muted-foreground">Loading measurements...</div>
            ) : measurements.length > 0 ? (
              <div className="space-y-3">
                <Select onValueChange={handleMeasurementSelect} value={selectedMeasurement?.id || ""}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose measurement set to pre-fill" />
                  </SelectTrigger>
                  <SelectContent>
                    {measurements.map((measurement) => (
                      <SelectItem key={measurement.id} value={measurement.id}>
                        <div className="flex items-center gap-2">
                          <span>{measurement.name}</span>
                          {measurement.is_default && (
                            <Badge variant="secondary" className="text-xs">
                              <Star className="h-3 w-3 mr-1" />
                              Default
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {selectedMeasurement && (
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium">Using: {selectedMeasurement.name}</div>
                      {selectedMeasurement.is_default && (
                        <Badge variant="secondary" className="text-xs">
                          <Star className="h-3 w-3 mr-1" />
                          Default
                        </Badge>
                      )}
                    </div>
                    <Button variant="outline" size="sm" onClick={clearMeasurements}>
                      Clear All
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                No saved measurements found for this customer.
                <br />
                <span className="text-sm">You can add measurements from the Measurements tab.</span>
                <br />
                <Button 
                  onClick={() => window.location.href = '/measurements'}
                  variant="outline"
                  className="mx-auto mt-2"
                  size="sm"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Go to Measurements
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Selected Measurements Display */}
      {selectedMeasurement && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ruler className="h-5 w-5" />
              Selected Measurements: {selectedMeasurement.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Basic Measurements */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {selectedMeasurement.chest && (
                  <div className="text-center p-3 bg-muted/30 rounded-lg">
                    <div className="text-sm text-muted-foreground">Chest</div>
                    <div className="text-lg font-semibold">{selectedMeasurement.chest}"</div>
                  </div>
                )}
                {selectedMeasurement.waist && (
                  <div className="text-center p-3 bg-muted/30 rounded-lg">
                    <div className="text-sm text-muted-foreground">Waist</div>
                    <div className="text-lg font-semibold">{selectedMeasurement.waist}"</div>
                  </div>
                )}
                {selectedMeasurement.hip && (
                  <div className="text-center p-3 bg-muted/30 rounded-lg">
                    <div className="text-sm text-muted-foreground">Hip</div>
                    <div className="text-lg font-semibold">{selectedMeasurement.hip}"</div>
                  </div>
                )}
                {selectedMeasurement.shoulder_width && (
                  <div className="text-center p-3 bg-muted/30 rounded-lg">
                    <div className="text-sm text-muted-foreground">Shoulder</div>
                    <div className="text-lg font-semibold">{selectedMeasurement.shoulder_width}"</div>
                  </div>
                )}
                {selectedMeasurement.arm_length && (
                  <div className="text-center p-3 bg-muted/30 rounded-lg">
                    <div className="text-sm text-muted-foreground">Arm Length</div>
                    <div className="text-lg font-semibold">{selectedMeasurement.arm_length}"</div>
                  </div>
                )}
                {selectedMeasurement.neck && (
                  <div className="text-center p-3 bg-muted/30 rounded-lg">
                    <div className="text-sm text-muted-foreground">Neck</div>
                    <div className="text-lg font-semibold">{selectedMeasurement.neck}"</div>
                  </div>
                )}
                {selectedMeasurement.thigh && (
                  <div className="text-center p-3 bg-muted/30 rounded-lg">
                    <div className="text-sm text-muted-foreground">Thigh</div>
                    <div className="text-lg font-semibold">{selectedMeasurement.thigh}"</div>
                  </div>
                )}
                {selectedMeasurement.inseam && (
                  <div className="text-center p-3 bg-muted/30 rounded-lg">
                    <div className="text-sm text-muted-foreground">Inseam</div>
                    <div className="text-lg font-semibold">{selectedMeasurement.inseam}"</div>
                  </div>
                )}
              </div>
              
              {selectedMeasurement.notes && (
                <div className="p-3 bg-muted/20 rounded-lg">
                  <div className="text-sm text-muted-foreground mb-1">Notes:</div>
                  <div className="text-sm">{selectedMeasurement.notes}</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fitting Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Fitting Preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <FormField
            control={form.control}
            name="fittingPreferences"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Style Notes & Fitting Preferences</FormLabel>
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
        </CardContent>
      </Card>

      <div className="bg-muted/50 p-4 rounded-lg">
        <h4 className="font-medium text-sm mb-2">Step 2: Measurements</h4>
        <p className="text-sm text-muted-foreground">
          Select from the customer's saved measurement sets to use for this order. 
          If no measurements are available, you can create them from the Measurements tab after saving this order.
        </p>
      </div>
    </div>
  )
}
