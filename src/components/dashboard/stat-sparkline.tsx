'use client'

import { Line, LineChart, ResponsiveContainer } from 'recharts'

interface StatSparklineProps {
  data: Array<{ month: string; revenue: number }>
}

/**
 * Axis-less six-point trend line for StatCard.
 *
 * Decorative reinforcement of the numeric delta shown alongside it — the value
 * and its percentage change are always present as text, so the sparkline is
 * hidden from assistive technology rather than described.
 */
export function StatSparkline({ data }: StatSparklineProps) {
  // An all-zero series draws a flat rule that reads as a divider rather than a
  // trend — omit it and let the empty value speak for itself.
  if (data.length < 2 || data.every((point) => point.revenue === 0)) return null

  return (
    <div className="h-8 w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="var(--chart-1)"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
