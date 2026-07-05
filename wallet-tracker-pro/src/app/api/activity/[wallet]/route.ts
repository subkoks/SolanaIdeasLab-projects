import { NextResponse } from 'next/server'
import { DatabaseService } from '@/services/database'
import { SolanaWatcherService } from '@/services/solana-watcher'

const DEFAULT_LIMIT = 10

export async function GET(
  request: Request,
  context: { params: Promise<{ wallet: string }> },
): Promise<NextResponse> {
  const { wallet } = await context.params
  const url = new URL(request.url)
  const limit = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)
  const watcher = new SolanaWatcherService()

  if (!watcher.isValidAddress(wallet)) {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
  }

  const database = new DatabaseService()

  try {
    await database.connect()
    const activity = await database.getRecentActivity(
      wallet,
      Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 50) : DEFAULT_LIMIT,
    )

    return NextResponse.json({
      wallet,
      activity: activity.map((event) => ({
        direction: event.direction,
        summary: event.summary,
        signature: event.signature,
        tokenMint: event.tokenMint,
        observedAt: event.observedAt.toISOString(),
      })),
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to load wallet activity',
      },
      { status: 500 },
    )
  } finally {
    await database.disconnect()
  }
}
