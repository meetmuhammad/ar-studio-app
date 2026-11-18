'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useInvalidateAuthStore, useIsAuthenticated, useLogin } from '@refinedev/core'
import { Alert, App, Button, Card, Flex, Form, Input, Typography, theme } from 'antd'
import { LockOutlined, MailOutlined } from '@ant-design/icons'
import { AppLogo } from '@/components/refine/app-logo'
import { useColorMode } from '@/components/providers/color-mode-provider'
import { cardShadow } from '@/lib/refine/theme'
import type { LoginParams } from '@/lib/refine/auth-provider'

// Only the OAuth consent page may be returned to after sign-in (no open redirect).
const afterSignIn = () => {
  const next = new URLSearchParams(window.location.search).get('next') ?? ''
  return /^\/oauth\/consent\?authorization_id=[\w-]+$/.test(next) ? next : '/'
}

interface SignInValues {
  email: string
  password: string
}

/**
 * Sign-in in the Ant Design Pro login style: centred card with the AR Studio
 * mark, email and password with icons, an inline error and a loading button.
 * Signs in through Refine's useLogin / authProvider (Supabase email +
 * password). Follows the light/dark mode of the rest of the app.
 */
export default function SignInPage() {
  const router = useRouter()
  const { token } = theme.useToken()
  const { mode } = useColorMode()
  const { message } = App.useApp()
  const [error, setError] = useState<string | null>(null)
  const invalidateAuthStore = useInvalidateAuthStore()
  const { data: auth, isLoading: authLoading } = useIsAuthenticated()

  // Refine's default success handler would follow an unvalidated `?to=` query
  // parameter, so redirection is handled here with the allow-list above.
  const { mutate: login, isPending: isSubmitting } = useLogin<LoginParams>({
    mutationOptions: {
      onSuccess: async ({ success, error: loginError }) => {
        await invalidateAuthStore()
        if (!success) {
          console.error('Sign in error:', loginError)
          setError(loginError?.message || 'Failed to sign in')
          return
        }
        message.success('Successfully signed in!')
        router.push(afterSignIn())
      },
      onError: (loginError) => {
        console.error('Sign in error:', loginError)
        setError(loginError instanceof Error ? loginError.message : 'Failed to sign in')
      },
    },
  })

  // Redirect if already signed in
  useEffect(() => {
    if (auth?.authenticated && !authLoading && !isSubmitting) {
      router.replace(afterSignIn())
    }
  }, [auth?.authenticated, authLoading, isSubmitting, router])

  const onFinish = ({ email, password }: SignInValues) => {
    setError(null)
    login({ email: email.trim(), password })
  }

  return (
    <Flex
      className="ar-antd"
      align="center"
      justify="center"
      style={{
        minHeight: '100dvh',
        padding: '32px 16px',
        background:
          mode === 'dark'
            ? token.colorBgLayout
            : `radial-gradient(circle at 20% 0%, ${token.colorPrimaryBg} 0, transparent 45%), ${token.colorBgLayout}`,
      }}
    >
      <div style={{ width: '100%', maxWidth: 400 }}>
        <Flex vertical align="center" gap={8} style={{ marginBottom: 28 }}>
          <Flex align="center" gap={10}>
            <span style={{ transform: 'scale(1.4)', display: 'inline-flex' }}>
              <AppLogo />
            </span>
            <Typography.Title level={2} style={{ margin: 0, marginLeft: 6 }}>
              AR Studio
            </Typography.Title>
          </Flex>
          <Typography.Text type="secondary">Customer &amp; Order Management System</Typography.Text>
        </Flex>

        <Card style={{ boxShadow: cardShadow(mode) }} styles={{ body: { padding: '28px 28px 12px' } }}>
          <Typography.Title level={4} style={{ marginTop: 0 }}>
            Sign in
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 20 }}>
            Enter your credentials to access the dashboard
          </Typography.Paragraph>

          {error && (
            <Alert
              type="error"
              showIcon
              message={error}
              closable
              onClose={() => setError(null)}
              style={{ marginBottom: 16 }}
              role="alert"
            />
          )}

          <Form<SignInValues>
            layout="vertical"
            size="large"
            onFinish={onFinish}
            requiredMark={false}
            disabled={isSubmitting}
            aria-label="Sign in"
          >
            <Form.Item
              label="Email"
              name="email"
              rules={[
                { required: true, message: 'Please enter your email' },
                { type: 'email', message: 'Please enter a valid email' },
              ]}
            >
              <Input prefix={<MailOutlined />} placeholder="admin@example.com" autoComplete="email" autoFocus inputMode="email" />
            </Form.Item>
            <Form.Item label="Password" name="password" rules={[{ required: true, message: 'Please enter your password' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="Enter your password" autoComplete="current-password" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" block loading={isSubmitting}>
                {isSubmitting ? 'Signing in...' : 'Sign In'}
              </Button>
            </Form.Item>
          </Form>
        </Card>
      </div>
    </Flex>
  )
}
