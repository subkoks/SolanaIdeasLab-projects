import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const readTestDatabaseUrl = (): string | null => {
  const raw = process.env.TEST_DATABASE_URL?.trim()
  if (!raw) {
    return null
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL URL')
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('TEST_DATABASE_URL must use the postgres protocol')
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
  if (!/(^|[_-])(test|fixture|ci)([_-]|$)/i.test(databaseName)) {
    throw new Error(
      'TEST_DATABASE_URL must name a dedicated test, fixture, or CI database',
    )
  }

  return raw
}

const testDatabaseUrl = readTestDatabaseUrl()

export const describeIfTestDatabase = testDatabaseUrl ? describe : describe.skip

export const createTestPrismaClient = (): PrismaClient => {
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL is required for database tests')
  }

  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: testDatabaseUrl,
      application_name: 'wallet_tracker_test_suite',
    }),
  })
}
