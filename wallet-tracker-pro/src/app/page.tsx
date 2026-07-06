'use client'

import { useState, type ReactNode } from 'react'
import { ActivityChart } from '@/components/activity-chart'
import { ActivityTimelineChart } from '@/components/activity-timeline-chart'

interface DashboardStats {
  subscribers: number
  watches: number
  events: number
}

interface AnalyticsOverview {
  eventsLast24h: number
  eventsLast7d: number
  uniqueActiveWallets: number
  avgEventsPerWatch: number
}

interface TopWallet {
  walletAddress: string
  eventCount: number
}

interface ActivityEvent {
  direction: string
  summary: string | null
  signature: string
  tokenMint: string | null
  observedAt: string
}

interface ActivityBreakdown {
  in: number
  out: number
  total: number
  unknown: number
}

interface TimelinePoint {
  date: string
  in: number
  out: number
}

export default function HomePage(): ReactNode {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null)
  const [topWallets, setTopWallets] = useState<TopWallet[]>([])
  const [walletInput, setWalletInput] = useState('')
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [breakdown, setBreakdown] = useState<ActivityBreakdown | null>(null)
  const [timeline, setTimeline] = useState<TimelinePoint[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const loadStats = async (): Promise<void> => {
    const response = await fetch('/api/stats')
    if (!response.ok) {
      throw new Error('Failed to load stats')
    }
    setStats((await response.json()) as DashboardStats)
  }

  const loadAnalytics = async (): Promise<void> => {
    const [overviewRes, topRes] = await Promise.all([
      fetch('/api/analytics/overview'),
      fetch('/api/analytics/top-wallets?limit=5'),
    ])

    if (!overviewRes.ok || !topRes.ok) {
      throw new Error('Failed to load analytics')
    }

    setOverview((await overviewRes.json()) as AnalyticsOverview)
    const topPayload = (await topRes.json()) as { wallets: TopWallet[] }
    setTopWallets(topPayload.wallets ?? [])
  }

  const lookupActivity = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    setActivity([])
    setBreakdown(null)
    setTimeline([])

    try {
      const wallet = walletInput.trim()
      if (!wallet) {
        setError('Enter a wallet address')
        return
      }

      const response = await fetch(
        `/api/activity/${encodeURIComponent(wallet)}?limit=10`,
      )
      const payload = (await response.json()) as {
        activity?: ActivityEvent[]
        breakdown?: ActivityBreakdown
        timeline?: TimelinePoint[]
        error?: string
      }

      if (!response.ok) {
        setError(payload.error ?? 'Lookup failed')
        return
      }

      setActivity(payload.activity ?? [])
      setBreakdown(payload.breakdown ?? null)
      setTimeline(payload.timeline ?? [])
    } catch {
      setError('Failed to fetch activity')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main
      style={{
        margin: '0 auto',
        maxWidth: '960px',
        padding: '2.5rem 1.5rem',
        fontFamily: 'system-ui, sans-serif',
        color: '#e5e7eb',
        background: '#0b0f17',
        minHeight: '100vh',
      }}
    >
      <p
        style={{
          color: '#94a3b8',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        SolanaIdeasLab
      </p>
      <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>
        Wallet Tracker Pro
      </h1>
      <p style={{ color: '#cbd5e1', lineHeight: 1.6, maxWidth: '48rem' }}>
        Telegram bot MVP is live. This dashboard reads watch activity from
        Postgres. Use the bot for alerts; use this page for lookup and stats.
      </p>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem' }}>Live stats</h2>
        <button
          type="button"
          onClick={() => void loadStats()}
          style={{
            marginTop: '0.75rem',
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            border: '1px solid #334155',
            background: '#1e293b',
            color: '#e2e8f0',
            cursor: 'pointer',
          }}
        >
          Refresh stats
        </button>
        {stats ? (
          <ul style={{ paddingLeft: '1.25rem', lineHeight: 1.8, marginTop: '1rem' }}>
            <li>
              <strong>{stats.subscribers}</strong> Telegram subscribers
            </li>
            <li>
              <strong>{stats.watches}</strong> active wallet watches
            </li>
            <li>
              <strong>{stats.events}</strong> recorded activity events
            </li>
          </ul>
        ) : null}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem' }}>Analytics (7-day)</h2>
        <button
          type="button"
          onClick={() => void loadAnalytics()}
          style={{
            marginTop: '0.75rem',
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            border: '1px solid #334155',
            background: '#1e293b',
            color: '#e2e8f0',
            cursor: 'pointer',
          }}
        >
          Load analytics
        </button>
        {overview ? (
          <ul style={{ paddingLeft: '1.25rem', lineHeight: 1.8, marginTop: '1rem' }}>
            <li>
              <strong>{overview.eventsLast24h}</strong> events in last 24h
            </li>
            <li>
              <strong>{overview.eventsLast7d}</strong> events in last 7 days
            </li>
            <li>
              <strong>{overview.uniqueActiveWallets}</strong> wallets with
              activity this week
            </li>
            <li>
              <strong>{overview.avgEventsPerWatch}</strong> avg events per active
              watch
            </li>
          </ul>
        ) : null}
        {topWallets.length > 0 ? (
          <>
            <h3 style={{ fontSize: '1rem', marginTop: '1rem' }}>
              Top active wallets
            </h3>
            <ul style={{ paddingLeft: '1.25rem', lineHeight: 1.8 }}>
              {topWallets.map((wallet) => (
                <li key={wallet.walletAddress}>
                  {wallet.walletAddress.slice(0, 8)}… —{' '}
                  <strong>{wallet.eventCount}</strong> events
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem' }}>Activity lookup</h2>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
          <input
            value={walletInput}
            onChange={(event) => setWalletInput(event.target.value)}
            placeholder="Solana wallet address"
            style={{
              flex: 1,
              padding: '0.6rem 0.75rem',
              borderRadius: '0.5rem',
              border: '1px solid #334155',
              background: '#111827',
              color: '#f8fafc',
            }}
          />
          <button
            type="button"
            disabled={loading}
            onClick={() => void lookupActivity()}
            style={{
              padding: '0.6rem 1rem',
              borderRadius: '0.5rem',
              border: '1px solid #334155',
              background: '#2563eb',
              color: '#fff',
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading ? 'Loading…' : 'Lookup'}
          </button>
        </div>
        {error ? (
          <p style={{ color: '#f87171', marginTop: '0.75rem' }}>{error}</p>
        ) : null}
        {breakdown ? <ActivityChart breakdown={breakdown} /> : null}
        {timeline.length > 0 ? (
          <ActivityTimelineChart timeline={timeline} />
        ) : null}
        {activity.length > 0 ? (
          <ul style={{ paddingLeft: '1.25rem', lineHeight: 1.8, marginTop: '1rem' }}>
            {activity.map((event) => (
              <li key={event.signature}>
                {event.summary ?? event.direction} —{' '}
                {new Date(event.observedAt).toLocaleString()}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  )
}
