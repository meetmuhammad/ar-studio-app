'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function ApiTestPage() {
  const [results, setResults] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const testApi = async (endpoint: string, method = 'GET', body?: any) => {
    setLoading(true)
    try {
      const options: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
      }
      
      if (body) {
        options.body = JSON.stringify(body)
      }

      const response = await fetch(endpoint, options)
      const data = await response.json()
      
      setResults(JSON.stringify({
        status: response.status,
        data
      }, null, 2))
    } catch (error) {
      setResults(`Error: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">API Test</h2>
        <p className="text-muted-foreground">Test the API endpoints to see what's working.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Customer APIs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button 
              onClick={() => testApi('/api/customers')}
              disabled={loading}
              className="w-full"
            >
              GET /api/customers
            </Button>
            <Button 
              onClick={() => testApi('/api/customers', 'POST', {
                name: 'Test Customer',
                phone: '+1234567890',
                address: '123 Test Street'
              })}
              disabled={loading}
              className="w-full"
              variant="outline"
            >
              POST /api/customers (Create Test Customer)
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Order APIs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button 
              onClick={() => testApi('/api/orders')}
              disabled={loading}
              className="w-full"
            >
              GET /api/orders
            </Button>
            <Button 
              onClick={() => testApi('/api/orders', 'POST', {
                customerId: 'test-id',
                bookingDate: '2025-01-15',
                chest: 42.5,
                waist: 36.0,
                comments: 'Test order'
              })}
              disabled={loading}
              className="w-full"
              variant="outline"
            >
              POST /api/orders (Test - may fail without valid customer)
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto max-h-96">
            {loading ? 'Loading...' : results || 'No results yet. Click a button above to test an API endpoint.'}
          </pre>
        </CardContent>
      </Card>
    </div>
  )
}