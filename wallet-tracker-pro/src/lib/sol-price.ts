import { config } from './config'
import { logger } from './logger'

const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd'

const CACHE_TTL_MS = 5 * 60 * 1000

let cachedPrice: number | null = null
let cachedAt = 0

export type SolPriceSource = 'coingecko' | 'mock'

export const getSolUsdPrice = async (): Promise<{
  priceUsd: number
  source: SolPriceSource
}> => {
  const mockPrice = config.analytics.mockSolUsdPrice

  if (config.analytics.preferMockSolPrice) {
    return { priceUsd: mockPrice, source: 'mock' }
  }

  const now = Date.now()
  if (cachedPrice !== null && now - cachedAt < CACHE_TTL_MS) {
    return { priceUsd: cachedPrice, source: 'coingecko' }
  }

  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    }

    if (config.analytics.coingeckoApiKey.trim()) {
      headers['x-cg-demo-api-key'] = config.analytics.coingeckoApiKey
    }

    const response = await fetch(COINGECKO_URL, { headers })

    if (!response.ok) {
      throw new Error(`CoinGecko HTTP ${response.status}`)
    }

    const payload = (await response.json()) as {
      solana?: { usd?: number }
    }

    const livePrice = payload.solana?.usd
    if (!livePrice || !Number.isFinite(livePrice)) {
      throw new Error('CoinGecko response missing SOL price')
    }

    cachedPrice = livePrice
    cachedAt = now

    return { priceUsd: livePrice, source: 'coingecko' }
  } catch (error) {
    logger.warn('SOL price fetch failed, using mock fallback', { error })
    return { priceUsd: mockPrice, source: 'mock' }
  }
}

export const resetSolPriceCacheForTests = (): void => {
  cachedPrice = null
  cachedAt = 0
}
