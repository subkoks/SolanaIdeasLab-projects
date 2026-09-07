import { NextResponse } from 'next/server'
import { isFixtureActivityId, getFixtureActivity } from '../../../../services/fixtureActivityAdapter'

export async function GET(request: Request): Promise<NextResponse> {
  // Production gate must run before any query parsing, service access, or fixture lookup.
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const url = new URL(request.url)
  const raw = url.searchParams.get('fixture')
  if (typeof raw !== 'string' || raw.trim() === '') {
    return NextResponse.json({ error: 'fixture query param required' }, { status: 400 })
  }
  if (!isFixtureActivityId(raw)) {
    return NextResponse.json({ error: 'Unknown fixture id' }, { status: 400 })
  }
  return NextResponse.json(getFixtureActivity(raw))
}
