'use client'

import { useId } from 'react'
import { Card, Divider, Skeleton, Space, Tooltip, Typography, theme } from 'antd'
import { CaretDownFilled, CaretUpFilled, InfoCircleOutlined } from '@ant-design/icons'
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis } from 'recharts'
import { useColorMode } from '@/components/providers/color-mode-provider'
import { cardShadow } from '@/lib/refine/theme'

export interface MiniPoint {
  label: string
  value: number
}

/** "+12.5%" up / "-3.0%" down vs the previous period; "—" when there is no base. */
export function Trend({ current, previous, label = 'vs previous period' }: { current: number; previous: number | undefined; label?: string }) {
  const { token } = theme.useToken()
  if (previous === undefined) return null
  if (previous === 0) {
    return (
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {label}: —
      </Typography.Text>
    )
  }
  const change = ((current - previous) / Math.abs(previous)) * 100
  const up = change >= 0
  return (
    <Space size={4} style={{ fontSize: 12 }} aria-label={`${up ? 'Up' : 'Down'} ${Math.abs(change).toFixed(1)}% ${label}`}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {label}
      </Typography.Text>
      <span style={{ color: up ? token.colorSuccess : token.colorError, whiteSpace: 'nowrap' }}>
        {up ? <CaretUpFilled /> : <CaretDownFilled />} {Math.abs(change).toFixed(1)}%
      </span>
    </Space>
  )
}

interface ChartCardProps {
  title: string
  tooltip?: string
  value: React.ReactNode
  trend?: React.ReactNode
  chart?: { kind: 'area' | 'bar'; data: MiniPoint[]; color: string; format?: (v: number) => string }
  footer?: React.ReactNode
  loading?: boolean
}

/**
 * The Ant Design Pro analysis "ChartCard": title with an info tooltip, a big
 * number, a trend line, a mini chart, and a footer below a divider.
 */
export function ChartCard({ title, tooltip, value, trend, chart, footer, loading }: ChartCardProps) {
  const { token } = theme.useToken()
  const { mode } = useColorMode()
  const gradient = `cc-${useId().replace(/:/g, '')}`

  return (
    <Card style={{ boxShadow: cardShadow(mode), height: '100%' }} styles={{ body: { padding: '20px 24px 12px' } }}>
      <Skeleton loading={loading} active paragraph={{ rows: 3 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Typography.Text type="secondary">{title}</Typography.Text>
          {tooltip && (
            <Tooltip title={tooltip}>
              <InfoCircleOutlined style={{ color: token.colorTextTertiary }} aria-label={`About ${title}`} />
            </Tooltip>
          )}
        </Space>
        <div style={{ fontSize: 28, lineHeight: '38px', fontWeight: 600, marginTop: 4, whiteSpace: 'nowrap' }}>{value}</div>
        <div style={{ minHeight: 22 }}>{trend}</div>
        <div style={{ height: 46, marginTop: 4 }} aria-hidden="true">
          {chart && chart.data.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              {chart.kind === 'area' ? (
                <AreaChart data={chart.data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chart.color} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={chart.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" hide />
                  <ChartTooltip
                    cursor={false}
                    contentStyle={{ background: token.colorBgElevated, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 6, fontSize: 12 }}
                    labelStyle={{ color: token.colorTextSecondary }}
                    itemStyle={{ color: token.colorText }}
                    formatter={(v) => [chart.format ? chart.format(Number(v)) : String(v), title]}
                  />
                  <Area type="monotone" dataKey="value" stroke={chart.color} strokeWidth={2} fill={`url(#${gradient})`} isAnimationActive={false} />
                </AreaChart>
              ) : (
                <BarChart data={chart.data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                  <XAxis dataKey="label" hide />
                  <ChartTooltip
                    cursor={{ fill: token.colorFillTertiary }}
                    contentStyle={{ background: token.colorBgElevated, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 6, fontSize: 12 }}
                    labelStyle={{ color: token.colorTextSecondary }}
                    itemStyle={{ color: token.colorText }}
                    formatter={(v) => [chart.format ? chart.format(Number(v)) : String(v), title]}
                  />
                  <Bar dataKey="value" fill={chart.color} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
        {footer && (
          <>
            <Divider style={{ margin: '10px 0 8px' }} />
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              {footer}
            </Typography.Text>
          </>
        )}
      </Skeleton>
    </Card>
  )
}
