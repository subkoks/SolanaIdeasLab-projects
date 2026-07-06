import { NextResponse } from 'next/server'

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: 'ok',
    service: 'wallet-tracker-pro',
    timestamp: new Date().toISOString(),
  })
}
