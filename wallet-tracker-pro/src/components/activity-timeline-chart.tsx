'use client'

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

interface TimelinePoint {
  date: string
  in: number
  out: number
}

export function ActivityTimelineChart({
  timeline,
}: {
  timeline: TimelinePoint[]
}) {
  if (timeline.length === 0) {
    return null
  }

  return (
    <div style={{ width: '100%', height: 260, marginTop: '1.5rem' }}>
      <ResponsiveContainer>
        <LineChart data={timeline}>
          <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
          <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} stroke="#94a3b8" />
          <Tooltip
            contentStyle={{
              background: '#1e293b',
              border: '1px solid #334155',
              color: '#e2e8f0',
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="in"
            stroke="#22c55e"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="out"
            stroke="#ef4444"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
