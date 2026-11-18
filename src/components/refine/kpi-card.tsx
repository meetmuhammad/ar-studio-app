'use client'

import { useId } from 'react'
import { Card, Skeleton, Typography, theme } from 'antd'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { useColorMode } from '@/components/providers/color-mode-provider'
import { cardShadow } from '@/lib/refine/theme'

export interface SparkPoint {
  label: string
  value: number
}

interface KpiCardProps {
  icon: React.ReactNode
  title: string
  value: React.ReactNode
  color: string
  data: SparkPoint[]
  loading?: boolean
  formatValue?: (value: number) => string
}

/** CRM-style KPI card: icon, title, big number and a small area sparkline. */
export function KpiCard({ icon, title, value, color, data, loading, formatValue = String }: KpiCardProps) {
  const { token } = theme.useToken()
  const { mode } = useColorMode()
  const gradientId = `kpi-${useId().replace(/:/g, '')}`

  return (
    <Card style={{ boxShadow: cardShadow(mode), height: '100%' }} styles={{ body: { padding: '16px 20px' } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: '50%',
            color,
            background: `color-mix(in srgb, ${color} 12%, transparent)`,
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
        <Typography.Text style={{ fontSize: 15 }}>{title}</Typography.Text>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginTop: 8 }}>
        {loading ? (
          <Skeleton.Button active style={{ width: 96, height: 44 }} />
        ) : (
          <Typography.Text strong style={{ fontSize: 36, lineHeight: 1.1, whiteSpace: 'nowrap' }}>
            {value}
          </Typography.Text>
        )}
        <div style={{ flex: '1 1 auto', maxWidth: 220, height: 56 }} aria-hidden="true">
          {!loading && data.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" hide />
                <Tooltip
                  cursor={false}
                  contentStyle={{
                    background: token.colorBgElevated,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: token.colorTextSecondary }}
                  itemStyle={{ color: token.colorText }}
                  formatter={(v) => [formatValue(Number(v)), title]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </Card>
  )
}
