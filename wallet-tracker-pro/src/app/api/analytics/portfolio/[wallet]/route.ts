import { NextResponse } from 'next/server'
import { DatabaseService } from '@/services/database'
import { SolanaWatcherService } from '@/services/solana-watcher'

export async function GET(
  _request: Request,
  context: { params: Promise<{ wallet: string }> },
): Promise<NextResponse> {
  const { wallet } = await context.params
  const watcher = new SolanaWatcherService()

  if (!watcher.isValidAddress(wallet)) {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
  }

  const database = new DatabaseService()

  try {
    await database.connect()
    const portfolio = await database.getWalletPortfolioSummary(wallet, 30)
    return NextResponse.json({ wallet, portfolio })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load portfolio summary',
      },
      { status: 500 },
    )
  } finally {
    await database.disconnect()
  }
}
