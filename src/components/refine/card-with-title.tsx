'use client'

import { Card, theme, type CardProps } from 'antd'
import { useColorMode } from '@/components/providers/color-mode-provider'
import { cardShadow } from '@/lib/refine/theme'

interface CardWithTitleProps extends Omit<CardProps, 'title' | 'extra'> {
  icon?: React.ReactNode
  title: React.ReactNode
  /** Optional action rendered on the right of the header. */
  action?: React.ReactNode
}

/**
 * White rounded card with a soft shadow and a header of icon + title on the
 * left and an optional action on the right (the CRM-style section card).
 */
export function CardWithTitle({ icon, title, action, style, styles, children, ...rest }: CardWithTitleProps) {
  const { token } = theme.useToken()
  const { mode } = useColorMode()

  return (
    <Card
      {...rest}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontWeight: 600 }}>
          {icon ? <span style={{ color: token.colorTextSecondary, display: 'inline-flex' }}>{icon}</span> : null}
          {title}
        </span>
      }
      extra={action}
      style={{ boxShadow: cardShadow(mode), ...style }}
      styles={{
        header: { background: mode === 'dark' ? undefined : token.colorFillAlter, minHeight: 56, ...styles?.header },
        ...styles,
      }}
    >
      {children}
    </Card>
  )
}
