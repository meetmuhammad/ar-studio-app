"use client"

import { useState, useEffect } from "react"
import { useFormContext } from "react-hook-form"
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription
} from "@/components/ui/form"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { CreateOrderInput } from "@/lib/validators"
import { Measurement, MEASUREMENT_FIELDS, MeasurementFormData } from "@/types/measurements"
import { Star, Ruler, Plus, RefreshCw, Edit3 } from "lucide-react"
import { toast } from "sonner"

export function OrderMeasurementsStep() {
  const form = useFormContext<CreateOrderInput>()
  const [measurements, setMeasurements] = useState<Measurement[]>([])
  const [selectedMeasurement, setSelectedMeasurement] = useState<Measurement | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState("saved")
  const [newMeasurement, setNewMeasurement] = useState<Partial<MeasurementFormData>>({})
  const [isCreatingMeasurement, setIsCreatingMeasurement] = useState(false)
  
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

  // Reset new measurement form when customer changes
  useEffect(() => {
    if (customerId) {
      setNewMeasurement({
        customer_id: customerId,
        name: "New Measurements",
        is_default: measurements.length === 0 // Set as default if no existing measurements
      })
    }
  }, [customerId, measurements.length])

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

  const handleCreateMeasurement = async () => {
    if (!customerId) {
      toast.error('Please select a customer first')
      return
    }

    // Validate that at least some measurements are provided
    const hasAnyMeasurement = MEASUREMENT_FIELDS.some(field => {
      const value = newMeasurement[field.key]
      return value !== undefined && value !== null && value !== 0
    })

    if (!hasAnyMeasurement) {
      toast.error('Please provide at least one measurement')
      return
    }

    // Client-side validation for measurement limits
    const validationErrors: string[] = []
    
    MEASUREMENT_FIELDS.forEach(field => {
      const value = newMeasurement[field.key as keyof MeasurementFormData] as number | undefined
      if (value !== undefined && value !== null) {
        // Check if value is positive
        if (value <= 0) {
          validationErrors.push(`${field.label} must be positive`)
          return
        }
        
        // Check maximum limits based on field type
        let maxValue = 100 // default
        if (field.key === 'shoe_size') {
          maxValue = 20
        } else if (field.key.includes('length') || field.key.includes('coat') || field.key.includes('sherwani') || field.key.includes('kameez')) {
          maxValue = 60
        } else if (field.key.includes('chest') || field.key.includes('waist') || field.key.includes('hip') || field.key.includes('pent')) {
          maxValue = 100
        } else if (field.key.includes('biceps') || field.key.includes('neck') || field.key.includes('knee') || field.key.includes('bottom')) {
          maxValue = 30
        } else if (field.key.includes('wrist') || field.key.includes('turban')) {
          maxValue = 20
        } else {
          maxValue = 60 // For shoulder, sleeves, cross_back, thigh etc.
        }
        
        if (value > maxValue) {
          validationErrors.push(`${field.label} must be under ${maxValue} inches`)
        }
      }
    })
    
    if (validationErrors.length > 0) {
      toast.error(`Validation failed: ${validationErrors[0]}`, {
        description: validationErrors.length > 1 ? `And ${validationErrors.length - 1} more errors` : undefined
      })
      return
    }

    try {
      setIsCreatingMeasurement(true)
      
      const measurementData = {
        ...newMeasurement,
        customer_id: customerId,
        name: newMeasurement.name || 'New Measurements',
      }

      const response = await fetch('/api/measurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(measurementData)
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('Server error:', errorData)
        throw new Error(errorData.error || 'Failed to create measurement')
      }

      const result = await response.json()
      const createdMeasurement = result.measurement || result
      
      // Refresh measurements list
      await fetchCustomerMeasurements(customerId)
      
      // Select the newly created measurement
      setSelectedMeasurement(createdMeasurement)
      form.setValue("measurementId", createdMeasurement.id)
      
      // Switch back to saved measurements tab
      setActiveTab('saved')
      
      toast.success('Measurement created successfully!')
    } catch (error) {
      console.error('Error creating measurement:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to create measurement'
      toast.error(`Error: ${errorMessage}`)
    } finally {
      setIsCreatingMeasurement(false)
    }
  }

  const handleMeasurementFieldChange = (fieldKey: string, value: number | undefined) => {
    setNewMeasurement(prev => ({
      ...prev,
      [fieldKey]: value
    }))
  }

  const getFieldValidation = (fieldKey: string, value: number | undefined) => {
    if (value === undefined || value === null) return { isValid: true, error: null }
    
    if (value <= 0) {
      return { isValid: false, error: 'Must be positive' }
    }
    
    // Get max value based on field type
    let maxValue = 100
    if (fieldKey === 'shoe_size') {
      maxValue = 20
    } else if (fieldKey.includes('length') || fieldKey.includes('coat') || fieldKey.includes('sherwani') || fieldKey.includes('kameez')) {
      maxValue = 60
    } else if (fieldKey.includes('chest') || fieldKey.includes('waist') || fieldKey.includes('hip') || fieldKey.includes('pent')) {
      maxValue = 100
    } else if (fieldKey.includes('biceps') || fieldKey.includes('neck') || fieldKey.includes('knee') || fieldKey.includes('bottom')) {
      maxValue = 30
    } else if (fieldKey.includes('wrist') || fieldKey.includes('turban')) {
      maxValue = 20
    } else {
      maxValue = 60 // For shoulder, sleeves, cross_back, thigh etc.
    }
    
    if (value > maxValue) {
      return { isValid: false, error: `Max ${maxValue} inches` }
    }
    
    return { isValid: true, error: null }
  }

  const handleNewMeasurementNameChange = (name: string) => {
    setNewMeasurement(prev => ({
      ...prev,
      name
    }))
  }

  const handleSetAsDefault = (isDefault: boolean) => {
    setNewMeasurement(prev => ({
      ...prev,
      is_default: isDefault
    }))
  }

  const handleNotesChange = (notes: string) => {
    setNewMeasurement(prev => ({
      ...prev,
      notes
    }))
  }


  return (
    <div className="space-y-6">
      {!customerId && (
        <div className="text-center py-8 text-muted-foreground">
          <Ruler className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Please select a customer in Step 1 to add measurements.</p>
        </div>
      )}

      {customerId && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="saved" className="flex items-center gap-2">
              <Ruler className="h-4 w-4" />
              Saved Measurements {measurements.length > 0 && `(${measurements.length})`}
            </TabsTrigger>
            <TabsTrigger value="create" className="flex items-center gap-2">
              <Edit3 className="h-4 w-4" />
              Create New
            </TabsTrigger>
          </TabsList>

          {/* Saved Measurements Tab */}
          <TabsContent value="saved" className="space-y-4">
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
                        <SelectValue placeholder="Choose measurement set" />
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
                          Clear
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <Ruler className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No saved measurements found for this customer.</p>
                    <p className="text-xs mt-1">Switch to &quot;Create New&quot; tab to add measurements now.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Selected Measurements Display */}
            {selectedMeasurement && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Ruler className="h-5 w-5" />
                    {selectedMeasurement.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {MEASUREMENT_FIELDS.map((field) => {
                      const value = selectedMeasurement[field.key as keyof Measurement] as number
                      if (!value || typeof value !== 'number') return null
                      return (
                        <div key={field.key} className="text-center p-3 bg-muted/30 rounded-lg">
                          <div className="text-sm text-muted-foreground">{field.label}</div>
                          <div className="text-lg font-semibold">{value}&quot;</div>
                        </div>
                      )
                    })}
                  </div>
                  {selectedMeasurement.notes && (
                    <div className="mt-4 p-3 bg-muted/20 rounded-lg">
                      <div className="text-sm text-muted-foreground mb-1">Notes:</div>
                      <div className="text-sm">{selectedMeasurement.notes}</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Create New Measurements Tab */}
          <TabsContent value="create" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Edit3 className="h-5 w-5" />
                  Create New Measurements
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Add measurements for the selected customer. They will be saved and can be reused for future orders.
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Basic Info */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Measurement Set Name</Label>
                    <Input
                      value={newMeasurement.name || ''}
                      onChange={(e) => handleNewMeasurementNameChange(e.target.value)}
                      placeholder="e.g., Formal Wear Measurements"
                    />
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      checked={newMeasurement.is_default || false}
                      onCheckedChange={handleSetAsDefault}
                    />
                    <Label className="text-sm font-normal">
                      Set as default measurements for this customer
                    </Label>
                  </div>
                </div>

                <Separator />

                {/* Measurements Grid */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-medium">Body Measurements</h3>
                    <div className="text-xs text-muted-foreground">All measurements in inches</div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {MEASUREMENT_FIELDS.map((field) => {
                      const fieldValue = newMeasurement[field.key as keyof MeasurementFormData] as number | undefined
                      const validation = getFieldValidation(field.key, fieldValue)
                      const maxValue = field.key.includes('shoulder') || field.key.includes('arm') || field.key.includes('length') || field.key.includes('seam') ? 50 :
                        field.key.includes('chest') || field.key.includes('waist') || field.key.includes('hip') || field.key.includes('thigh') ? 100 :
                        field.key.includes('neck') || field.key.includes('bicep') || field.key.includes('knee') || field.key.includes('calf') ? 30 :
                        field.key.includes('wrist') ? 15 :
                        field.key.includes('ankle') ? 20 : 100
                      
                      return (
                        <div key={field.key} className="space-y-2">
                          <Label className="text-sm">
                            {field.label}
                            <span className="text-xs text-muted-foreground ml-1">(max {maxValue}&quot;)</span>
                          </Label>
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max={maxValue}
                            placeholder="0.0"
                            value={typeof fieldValue === 'number' ? fieldValue.toString() : ''}
                            onChange={(e) => {
                              const value = e.target.value
                              handleMeasurementFieldChange(field.key, value === '' ? undefined : parseFloat(value))
                            }}
                            onWheel={(e) => e.currentTarget.blur()}
                            className={!validation.isValid ? 'border-destructive focus-visible:ring-destructive' : ''}
                          />
                          {!validation.isValid && validation.error && (
                            <p className="text-xs text-destructive">{validation.error}</p>
                          )}
                          <p className="text-xs text-muted-foreground">{field.description}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <Separator />

                {/* Notes */}
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={newMeasurement.notes || ''}
                    onChange={(e) => handleNotesChange(e.target.value)}
                    placeholder="Additional notes about these measurements..."
                    rows={3}
                  />
                </div>

                {/* Actions */}
                <div className="flex justify-end">
                  <Button 
                    onClick={handleCreateMeasurement} 
                    disabled={isCreatingMeasurement || (() => {
                      // Check if there are any validation errors
                      return MEASUREMENT_FIELDS.some(field => {
                        const fieldValue = newMeasurement[field.key as keyof MeasurementFormData] as number | undefined
                        const validation = getFieldValidation(field.key, fieldValue)
                        return !validation.isValid
                      })
                    })()}
                    className="min-w-32"
                  >
                    {isCreatingMeasurement ? 'Creating...' : 'Create Measurements'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
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
                    rows={3}
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
          Select from saved measurements or create new ones. The customer info will be taken from Step 1.
        </p>
      </div>
    </div>
  )
}
