"use client"

import { useState, useEffect } from "react"
import { useForm, FormProvider } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, ChevronRight, Check } from "lucide-react"
import { CreateOrderSchema, CreateOrderInput } from "@/lib/validators"
import type { OrderWithCustomer } from "@/lib/supabase-client"
import { OrderGeneralInfoStep } from "./order-steps/general-info-step"
import { OrderMeasurementsStep } from "./order-steps/measurements-step"
import { OrderPaymentStep } from "./order-steps/payment-step"

interface OrderMultiStepFormProps {
  order?: OrderWithCustomer | null
  onSubmit: (data: CreateOrderInput) => Promise<void>
  onCancel: () => void
}

const steps = [
  { id: 1, title: "General Information", description: "Customer, dates, and comments" },
  { id: 2, title: "Measurements", description: "Body measurements and fitting preferences" },
  { id: 3, title: "Payment", description: "Payment method and amount details" }
]

export function OrderMultiStepForm({
  order,
  onSubmit,
  onCancel,
}: OrderMultiStepFormProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])

  const form = useForm<CreateOrderInput>({
    resolver: zodResolver(CreateOrderSchema) as any,
    defaultValues: {
      customerId: order?.customer_id || "",
      bookingDate: order ? new Date(order.booking_date) : new Date(),
      deliveryDate: order ? new Date(order.delivery_date) : undefined,
      comments: order?.comments || "",
      // Payment fields
      totalAmount: order?.total_amount || undefined,
      advancePaid: order?.advance_paid || undefined,
      balance: order?.balance || undefined,
      paymentMethod: order?.payment_method || "other",
      // Measurement fields
      chest: order?.chest || undefined,
      waist: order?.waist || undefined,
      hips: order?.hips || undefined,
      sleeves: order?.sleeves || undefined,
      neck: order?.neck || undefined,
      shoulder: order?.shoulder || undefined,
      crossBack: order?.cross_back || undefined,
      biceps: order?.biceps || undefined,
      wrist: order?.wrist || undefined,
      coatLength: order?.coat_length || undefined,
      threePieceWaistcoat: order?.three_piece_waistcoat || undefined,
      waistcoatLength: order?.waistcoat_length || undefined,
      sherwaniLength: order?.sherwani_length || undefined,
      pantWaist: order?.pant_waist || undefined,
      pantLength: order?.pant_length || undefined,
      thigh: order?.thigh || undefined,
      knee: order?.knee || undefined,
      bottom: order?.bottom || undefined,
      shoeSize: order?.shoe_size || undefined,
      turbanLength: order?.turban_length || undefined,
      fittingPreferences: order?.fitting_preferences || "",
    },
  })

  const { handleSubmit, trigger, watch, formState: { errors, isSubmitting }, setValue } = form

  // Watch totalAmount and advancePaid to calculate balance
  const totalAmount = watch("totalAmount")
  const advancePaid = watch("advancePaid")

  // Calculate balance automatically
  useEffect(() => {
    if (totalAmount !== undefined && advancePaid !== undefined) {
      const calculatedBalance = totalAmount - advancePaid
      setValue("balance", calculatedBalance >= 0 ? calculatedBalance : 0)
    }
  }, [totalAmount, advancePaid, setValue])

  // Validate current step
  const validateCurrentStep = async () => {
    let fieldsToValidate: (keyof CreateOrderInput)[] = []

    switch (currentStep) {
      case 1:
        fieldsToValidate = ["customerId", "bookingDate", "deliveryDate"]
        break
      case 2:
        // Measurements are optional, but we can validate if they are numeric
        fieldsToValidate = []
        break
      case 3:
        fieldsToValidate = ["totalAmount", "advancePaid", "paymentMethod"]
        break
    }

    console.log('Validating fields for step', currentStep, ':', fieldsToValidate)
    const isValid = await trigger(fieldsToValidate)
    console.log('Validation result:', isValid)
    
    if (!isValid) {
      console.log('Form errors:', errors)
    }
    
    if (isValid && !completedSteps.includes(currentStep)) {
      setCompletedSteps([...completedSteps, currentStep])
    }

    return isValid
  }

  const nextStep = async () => {
    console.log('Next step clicked, current step:', currentStep)
    const isValid = await validateCurrentStep()
    console.log('Step validation result:', isValid)
    
    if (isValid && currentStep < 3) {
      setCurrentStep(currentStep + 1)
    } else if (!isValid) {
      console.log('Validation failed, staying on current step')
    }
  }

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const onFormSubmit = async (data: CreateOrderInput) => {
    // Before submitting, validate the current step (especially step 3)
    const isCurrentStepValid = await validateCurrentStep()
    
    if (!isCurrentStepValid) {
      console.log('Current step validation failed, not submitting')
      return
    }
    
    console.log('Submitting order data:', data)
    await onSubmit(data)
  }

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return <OrderGeneralInfoStep />
      case 2:
        return <OrderMeasurementsStep />
      case 3:
        return <OrderPaymentStep />
      default:
        return null
    }
  }

  return (
    <FormProvider {...form}>
      <div className="space-y-6">
        {/* Step Progress */}
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className="flex items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-medium
                    ${completedSteps.includes(step.id)
                      ? "border-primary bg-primary text-primary-foreground"
                      : currentStep === step.id
                      ? "border-primary bg-background text-primary"
                      : "border-muted bg-background text-muted-foreground"
                    }`}
                >
                  {completedSteps.includes(step.id) ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    step.id
                  )}
                </div>
                <div className="ml-3">
                  <p className={`text-sm font-medium ${
                    currentStep === step.id ? "text-foreground" : "text-muted-foreground"
                  }`}>
                    {step.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
              </div>
              {index < steps.length - 1 && (
                <div className={`mx-4 h-px w-12 ${
                  completedSteps.includes(step.id) ? "bg-primary" : "bg-border"
                }`} />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Badge variant="outline">{currentStep} of {steps.length}</Badge>
              {steps.find(s => s.id === currentStep)?.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
              {renderCurrentStep()}
              
              {/* Navigation Buttons */}
              <div className="flex justify-between pt-6">
                <div className="flex gap-2">
                  {currentStep > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={prevStep}
                      disabled={isSubmitting}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onCancel}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  
                  {currentStep < 3 ? (
                    <Button
                      type="button"
                      onClick={nextStep}
                      disabled={isSubmitting}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={async () => {
                        const isValid = await validateCurrentStep()
                        if (isValid) {
                          handleSubmit(onFormSubmit)()
                        }
                      }}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "Saving..." : order ? "Update Order" : "Create Order"}
                    </Button>
                  )}
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </FormProvider>
  )
}