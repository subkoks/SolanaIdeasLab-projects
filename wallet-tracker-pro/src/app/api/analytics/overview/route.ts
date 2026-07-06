import { NextResponse } from 'next/server'
import { DatabaseService } from '@/services/database'

export async function GET(): Promise<NextResponse> {
  const database = new DatabaseService()

  try {
    await database.connect()
    const overview = await database.getAnalyticsOverview()
    return NextResponse.json(overview)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load analytics overview',
      },
      { status: 500 },
    )
  } finally {
    await database.disconnect()
  }
}
