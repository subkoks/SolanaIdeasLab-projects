'use client'

import { useEffect, useState, type ReactNode } from 'react'
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

interface WalletBehavior {
  days: number
  totalEvents: number
  inCount: number
  outCount: number
  inOutRatio: number
  netLamports: string
}

interface TokenMintBreakdown {
  tokenMint: string
  eventCount: number
}

interface PortfolioSummary {
  days: number
  uniqueTokens: number
  netSol: number
  estimatedNetUsd: number
  netDirection: string
  pricingMode: string
  solUsdPrice: number
}

interface BillingStatus {
  mode: string
  message: string
  tiers: string[]
  pricesUsd: Record<string, number>
  watchLimits: Record<string, number>
}

interface MockUpgradeResult {
  tier: string
  limits?: { tier: string; limit: number; used: number; remaining: number }
  message?: string
  error?: string
}

interface CheckoutSessionResult {
  mode?: string
  checkoutUrl?: string
  message?: string
  error?: string
}

interface SubscriberStatus {
  tier: string
  limits?: { tier: string; limit: number; used: number; remaining: number }
  billingMode?: string
}

export default function HomePage(): ReactNode {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null)
  const [topWallets, setTopWallets] = useState<TopWallet[]>([])
  const [walletInput, setWalletInput] = useState('')
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [breakdown, setBreakdown] = useState<ActivityBreakdown | null>(null)
  const [timeline, setTimeline] = useState<TimelinePoint[]>([])
  const [behavior, setBehavior] = useState<WalletBehavior | null>(null)
  const [tokenMints, setTokenMints] = useState<TokenMintBreakdown[]>([])
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null)
  const [billing, setBilling] = useState<BillingStatus | null>(null)
  const [chatIdInput, setChatIdInput] = useState('')
  const [upgradeTier, setUpgradeTier] = useState('pro')
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const pollSubscriberStatus = async (
    chatId: string,
    expectedTier: string,
  ): Promise<string> => {
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const response = await fetch(
        `/api/billing/subscriber?chatId=${encodeURIComponent(chatId)}`,
      )

      if (response.ok) {
        const payload = (await response.json()) as SubscriberStatus
        if (payload.tier === expectedTier && payload.limits) {
          return `Tier synced: ${payload.tier} (${payload.limits.used}/${payload.limits.limit} watches)`
        }
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 2000)
      })
    }

    return 'Checkout complete — waiting for Stripe webhook. Verify /limits in Telegram.'
  }

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const params = new URLSearchParams(window.location.search)
    const checkout = params.get('checkout')
    if (!checkout) {
      return
    }

    const completeCheckoutReturn = async (): Promise<void> => {
      if (checkout !== 'success') {
        setUpgradeMessage('Checkout cancelled')
        window.history.replaceState({}, '', window.location.pathname)
        return
      }

      let chatId = ''
      let tier = 'pro'
      const pending = sessionStorage.getItem('billing_pending')
      if (pending) {
        try {
          const parsed = JSON.parse(pending) as {
            chatId?: string
            tier?: string
          }
          chatId = parsed.chatId ?? ''
          tier = parsed.tier ?? tier
        } catch {
          // ignore malformed session payload
        }
        sessionStorage.removeItem('billing_pending')
      }

      if (chatId) {
        setChatIdInput(chatId)
        setUpgradeTier(tier)
      }

      const statusRes = await fetch('/api/billing/status')
      if (!statusRes.ok) {
        setUpgradeMessage('Checkout returned — reload billing status to verify')
        window.history.replaceState({}, '', window.location.pathname)
        return
      }

      const status = (await statusRes.json()) as BillingStatus
      setBilling(status)

      if (status.mode === 'mock' && chatId) {
        const response = await fetch('/api/billing/mock-upgrade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, tier }),
        })
        const payload = (await response.json()) as MockUpgradeResult
        setUpgradeMessage(
          response.ok
            ? payload.limits
              ? `Mock checkout complete — ${payload.tier}: ${payload.limits.used}/${payload.limits.limit} watches`
              : 'Mock checkout complete'
            : (payload.error ?? 'Mock completion failed'),
        )
      } else if (chatId) {
        setUpgradeMessage(await pollSubscriberStatus(chatId, tier))
      } else {
        setUpgradeMessage(
          'Checkout complete — verify tier in Telegram with /limits',
        )
      }

      window.history.replaceState({}, '', window.location.pathname)
    }

    void completeCheckoutReturn()
  }, [])

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

  const loadBilling = async (): Promise<void> => {
    const response = await fetch('/api/billing/status')
    if (!response.ok) {
      throw new Error('Failed to load billing')
    }
    setBilling((await response.json()) as BillingStatus)
  }

  const mockUpgrade = async (): Promise<void> => {
    setUpgradeMessage(null)
    const chatId = chatIdInput.trim()
    if (!chatId) {
      setUpgradeMessage('Enter your Telegram chat ID')
      return
    }

    const response = await fetch('/api/billing/mock-upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, tier: upgradeTier }),
    })

    const payload = (await response.json()) as MockUpgradeResult
    if (!response.ok) {
      setUpgradeMessage(payload.error ?? 'Upgrade failed')
      return
    }

    setUpgradeMessage(
      payload.limits
        ? `Upgraded to ${payload.tier}: ${payload.limits.used}/${payload.limits.limit} watches`
        : (payload.message ?? 'Upgraded'),
    )
  }

  const startCheckout = async (): Promise<void> => {
    setUpgradeMessage(null)
    const chatId = chatIdInput.trim()
    if (!chatId) {
      setUpgradeMessage('Enter your Telegram chat ID')
      return
    }

    const origin =
      typeof window !== 'undefined' ? window.location.origin : undefined

    const response = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId,
        tier: upgradeTier,
        successUrl: origin ? `${origin}/?checkout=success` : undefined,
        cancelUrl: origin ? `${origin}/?checkout=cancel` : undefined,
      }),
    })

    const payload = (await response.json()) as CheckoutSessionResult
    if (!response.ok) {
      setUpgradeMessage(payload.error ?? 'Checkout failed')
      return
    }

    if (payload.checkoutUrl) {
      sessionStorage.setItem(
        'billing_pending',
        JSON.stringify({ chatId, tier: upgradeTier }),
      )
      if (payload.mode === 'mock') {
        window.location.href = payload.checkoutUrl
      } else {
        window.open(payload.checkoutUrl, '_blank', 'noopener,noreferrer')
        setUpgradeMessage(payload.message ?? 'Checkout opened in a new tab')
      }
      return
    }
  }

  const lookupActivity = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    setActivity([])
    setBreakdown(null)
    setTimeline([])
    setBehavior(null)
    setTokenMints([])
    setPortfolio(null)

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
        behavior?: WalletBehavior
        tokenMints?: TokenMintBreakdown[]
        portfolio?: PortfolioSummary
        error?: string
      }

      if (!response.ok) {
        setError(payload.error ?? 'Lookup failed')
        return
      }

      setActivity(payload.activity ?? [])
      setBreakdown(payload.breakdown ?? null)
      setTimeline(payload.timeline ?? [])
      setBehavior(payload.behavior ?? null)
      setTokenMints(payload.tokenMints ?? [])
      setPortfolio(payload.portfolio ?? null)
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
        <h2 style={{ fontSize: '1.25rem' }}>Plans & billing</h2>
        <button
          type="button"
          onClick={() => void loadBilling()}
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
          Load plans
        </button>
        {billing ? (
          <>
            <p style={{ color: '#94a3b8', marginTop: '0.75rem' }}>
              Mode: <strong>{billing.mode}</strong> — {billing.message}
            </p>
            <ul style={{ paddingLeft: '1.25rem', lineHeight: 1.8, marginTop: '0.5rem' }}>
              {billing.tiers
                .filter((tier) => tier !== 'free')
                .map((tier) => (
                  <li key={tier}>
                    {tier}: ${billing.pricesUsd[tier]}/mo —{' '}
                    {billing.watchLimits[tier]} watches
                  </li>
                ))}
            </ul>
            <div style={{ marginTop: '1rem' }}>
              <p style={{ color: '#cbd5e1', fontSize: '0.9rem' }}>
                {billing.mode === 'mock'
                  ? 'Mock upgrade: enter Telegram chat ID or use bot /upgrade pro'
                  : 'Stripe checkout: enter Telegram chat ID (tier syncs via webhook)'}
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <input
                  value={chatIdInput}
                  onChange={(event) => setChatIdInput(event.target.value)}
                  placeholder="Telegram chat ID"
                  style={{
                    flex: 1,
                    padding: '0.5rem 0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #334155',
                    background: '#111827',
                    color: '#f8fafc',
                  }}
                />
                <select
                  value={upgradeTier}
                  onChange={(event) => setUpgradeTier(event.target.value)}
                  style={{
                    padding: '0.5rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #334155',
                    background: '#111827',
                    color: '#f8fafc',
                  }}
                >
                  <option value="basic">basic</option>
                  <option value="pro">pro</option>
                  <option value="enterprise">enterprise</option>
                </select>
                {billing.mode === 'mock' ? (
                  <button
                    type="button"
                    onClick={() => void mockUpgrade()}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #334155',
                      background: '#2563eb',
                      color: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    Mock upgrade
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startCheckout()}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #334155',
                      background: '#2563eb',
                      color: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    Checkout
                  </button>
                )}
              </div>
              {upgradeMessage ? (
                <p style={{ marginTop: '0.5rem', color: '#86efac' }}>
                  {upgradeMessage}
                </p>
              ) : null}
            </div>
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
        {behavior ? (
          <ul style={{ paddingLeft: '1.25rem', lineHeight: 1.8, marginTop: '1rem' }}>
            <li>
              30-day behavior: <strong>{behavior.inCount}</strong> in /{' '}
              <strong>{behavior.outCount}</strong> out (ratio{' '}
              {behavior.inOutRatio})
            </li>
            <li>
              Net lamports (30d): <strong>{behavior.netLamports}</strong>
            </li>
          </ul>
        ) : null}
        {portfolio ? (
          <ul style={{ paddingLeft: '1.25rem', lineHeight: 1.8, marginTop: '1rem' }}>
            <li>
              Portfolio ({portfolio.pricingMode} pricing @ ${portfolio.solUsdPrice}/SOL)
            </li>
            <li>
              Net flow: <strong>{portfolio.netSol.toFixed(4)} SOL</strong> (
              {portfolio.netDirection}) ≈ ${portfolio.estimatedNetUsd}
            </li>
            <li>
              Unique tokens touched: <strong>{portfolio.uniqueTokens}</strong>
            </li>
          </ul>
        ) : null}
        {tokenMints.length > 0 ? (
          <>
            <h3 style={{ fontSize: '1rem', marginTop: '1rem' }}>Token activity</h3>
            <ul style={{ paddingLeft: '1.25rem', lineHeight: 1.8 }}>
              {tokenMints.map((entry) => (
                <li key={entry.tokenMint}>
                  {entry.tokenMint.slice(0, 8)}… —{' '}
                  <strong>{entry.eventCount}</strong> events
                </li>
              ))}
            </ul>
          </>
        ) : null}
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
