import type { Measurement } from '@/types/measurements'
import { MEASUREMENT_FIELDS } from '@/types/measurements'

export const MEASUREMENTS = 'measurements'

/** Every column plus the customer (scoped by RLS like the measurement). */
export const MEASUREMENT_SELECT = '*, customer:customers(id, name, phone)'

/** Categories in the order the previous form showed them. */
export const MEASUREMENT_CATEGORIES = ['Upper Body', 'Length', 'Lower Body', 'Accessories'] as const

export const fieldsIn = (category: (typeof MEASUREMENT_CATEGORIES)[number]) =>
  MEASUREMENT_FIELDS.filter((f) => f.category === category)

/** Unit shown next to a reading. Shoe size is a size, not inches. */
export const unitFor = (key: (typeof MEASUREMENT_FIELDS)[number]['key']) => (key === 'shoe_size' ? '' : 'in')

/** "38.5 in", or an em dash when empty. */
export const formatReading = (measurement: Measurement, key: (typeof MEASUREMENT_FIELDS)[number]['key']) => {
  const value = measurement[key]
  if (value === undefined || value === null) return '—'
  const unit = unitFor(key)
  return unit ? `${value} ${unit}` : String(value)
}

export const DEFAULT_MEASUREMENT_NAME = 'Default Measurements'
export const standardNameFor = (customerName: string) => `${customerName} - Standard Measurements`

export type MeasurementRow = Measurement & { business_id?: string }
