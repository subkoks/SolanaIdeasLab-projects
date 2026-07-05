import { NextResponse } from 'next/server'
import { DatabaseService } from '@/services/database'

export async function GET(): Promise<NextResponse> {
  const database = new DatabaseService()

  try {
    await database.connect()
    const stats = await database.getDashboardStats()
    return NextResponse.json(stats)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to load dashboard stats',
      },
      { status: 500 },
    )
  } finally {
    await database.disconnect()
  }
}
