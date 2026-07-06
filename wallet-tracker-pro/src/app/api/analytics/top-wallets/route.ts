import { NextRequest, NextResponse } from 'next/server'
import { DatabaseService } from '@/services/database'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const database = new DatabaseService()
  const limitParam = request.nextUrl.searchParams.get('limit')
  const parsed = limitParam ? Number(limitParam) : 5
  const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 20) : 5

  try {
    await database.connect()
    const wallets = await database.getTopActiveWallets(limit)
    return NextResponse.json({ wallets })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load top active wallets',
      },
      { status: 500 },
    )
  } finally {
    await database.disconnect()
  }
}
