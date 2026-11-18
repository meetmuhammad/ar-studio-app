'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useInvalidateAuthStore, useIsAuthenticated, useLogin } from '@refinedev/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import type { LoginParams } from '@/lib/refine/auth-provider'

// Only the OAuth consent page may be returned to after sign-in (no open redirect).
const afterSignIn = () => {
  const next = new URLSearchParams(window.location.search).get('next') ?? ''
  return /^\/oauth\/consent\?authorization_id=[\w-]+$/.test(next) ? next : '/'
}

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()
  const invalidateAuthStore = useInvalidateAuthStore()
  const { data: auth, isLoading: authLoading } = useIsAuthenticated()

  // Refine's default success handler would follow an unvalidated `?to=` query
  // parameter, so redirection is handled here with the allow-list above.
  const { mutate: login, isPending: isSubmitting } = useLogin<LoginParams>({
    mutationOptions: {
      onSuccess: async ({ success, error }) => {
        await invalidateAuthStore()
        if (!success) {
          console.error('Sign in error:', error)
          toast.error(error?.message || 'Failed to sign in')
          return
        }
        toast.success('Successfully signed in!')
        router.push(afterSignIn())
      },
      onError: (error) => {
        console.error('Sign in error:', error)
        toast.error(error instanceof Error ? error.message : 'Failed to sign in')
      },
    },
  })

  // Redirect if already signed in
  useEffect(() => {
    if (auth?.authenticated && !authLoading && !isSubmitting) {
      router.replace(afterSignIn())
    }
  }, [auth?.authenticated, authLoading, isSubmitting, router])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    login({ email, password })
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6 sm:space-y-8">
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">AR Studio</h1>
          <p className="mt-2 text-sm sm:text-base text-muted-foreground">Customer & Order Management System</p>
        </div>

        <Card className='mb-6 sm:mb-8'>
          <CardHeader>
            <CardTitle className="text-xl sm:text-2xl">Sign In</CardTitle>
            <CardDescription className="text-sm">
              Enter your credentials to access the dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isSubmitting || authLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isSubmitting || authLoading}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isSubmitting || authLoading}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting || authLoading}
              >
                {(isSubmitting || authLoading) ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* <div className="text-center text-sm text-gray-600">
          <p>Demo Credentials:</p>
          <div className="mt-2 space-y-1">
            <p><strong>Admin:</strong> admin@example.com / admin123</p>
            <p><strong>Staff:</strong> staff@example.com / staff123</p>
          </div>
        </div> */}
      </div>
    </div>
  )
}
