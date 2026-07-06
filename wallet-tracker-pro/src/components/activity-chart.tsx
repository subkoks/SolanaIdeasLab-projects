'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

interface ActivityBreakdown {
  in: number
  out: number
  total: number
  unknown: number
}

export function ActivityChart({
  breakdown,
}: {
  breakdown: ActivityBreakdown
}) {
  const data = [
    { label: 'In', count: breakdown.in, fill: '#22c55e' },
    { label: 'Out', count: breakdown.out, fill: '#ef4444' },
    { label: 'Unknown', count: breakdown.unknown, fill: '#94a3b8' },
  ]

  if (breakdown.total === 0) {
    return null
  }

  return (
    <div style={{ width: '100%', height: 240, marginTop: '1.5rem' }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
          <XAxis dataKey="label" stroke="#94a3b8" />
          <YAxis allowDecimals={false} stroke="#94a3b8" />
          <Tooltip
            contentStyle={{
              background: '#1e293b',
              border: '1px solid #334155',
              color: '#e2e8f0',
            }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
