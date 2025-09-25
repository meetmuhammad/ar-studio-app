import { createClient } from '@supabase/supabase-js'
import { faker } from '@faker-js/faker'

// Make sure to set these environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY! // You'll need this from Supabase settings

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function main() {
  console.log('🌱 Starting Supabase seed...')

  // Create customers
  console.log('Creating customers...')
  const customers = []
  
  for (let i = 0; i < 20; i++) {
    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        name: faker.person.fullName(),
        phone: faker.phone.number(),
        address: faker.location.streetAddress({ useFullAddress: true }),
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating customer:', error)
      continue
    }

    customers.push(customer)
  }

  console.log(`Created ${customers.length} customers`)

  // Create orders
  console.log('Creating orders...')
  const measurementFields = [
    'chest', 'waist', 'hips', 'sleeves', 'neck', 'shoulder', 'cross_back', 
    'biceps', 'wrist', 'coat_length', 'three_piece_waistcoat', 'waistcoat_length',
    'sherwani_length', 'pant_waist', 'pant_length', 'thigh', 'knee', 'bottom',
    'shoe_size', 'turban_length'
  ]

  let successfulOrders = 0

  for (let i = 0; i < 30; i++) {
    try {
      // Get next order number
      const { data: orderNumber, error: rpcError } = await supabase.rpc('increment_counter', {
        counter_id: 1
      })

      if (rpcError) {
        console.error('Error generating order number:', rpcError)
        continue
      }

      // Random customer
      const randomCustomer = faker.helpers.arrayElement(customers)
      
      // Random booking date (within last 3 months)
      const bookingDate = faker.date.recent({ days: 90 })
      
      // Random delivery date (1-30 days after booking)
      const deliveryDate = faker.helpers.maybe(() => 
        faker.date.soon({ days: 30, refDate: bookingDate })
      , { probability: 0.8 })

      // Generate random measurements (only some fields filled)
      const measurements: Record<string, number> = {}
      const numMeasurements = faker.number.int({ min: 3, max: 12 })
      const selectedFields = faker.helpers.arrayElements(measurementFields, numMeasurements)
      
      selectedFields.forEach(field => {
        measurements[field] = faker.number.float({ min: 30, max: 150, fractionDigits: 1 })
      })

      const { data: order, error } = await supabase
        .from('orders')
        .insert({
          order_number: `AR-${orderNumber.toString().padStart(5, '0')}`,
          customer_id: randomCustomer.id,
          booking_date: bookingDate.toISOString().split('T')[0],
          delivery_date: deliveryDate ? deliveryDate.toISOString().split('T')[0] : null,
          comments: faker.helpers.maybe(() => faker.lorem.sentences(2), { probability: 0.6 }),
          fitting_preferences: faker.helpers.maybe(() => faker.lorem.sentence(), { probability: 0.4 }),
          ...measurements,
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating order:', error)
        continue
      }

      successfulOrders++
    } catch (error) {
      console.error('Error in order creation loop:', error)
    }
  }

  console.log(`Created ${successfulOrders} orders`)
  console.log('✅ Supabase seed completed!')
}

main()
  .catch((error) => {
    console.error('Seed script error:', error)
    process.exit(1)
  })