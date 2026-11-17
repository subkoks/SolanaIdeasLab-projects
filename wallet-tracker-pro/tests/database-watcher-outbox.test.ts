/**
 * @jest-environment node
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { config } from '../src/lib/config'
import { DatabaseService } from '../src/services/database'

const describeIfDatabase = process.env.DATABASE_URL ? describe : describe.skip
const WALLET = 'DbOutboxWatcher111111111111111111111111'

describeIfDatabase('DatabaseService watcher outbox', () => {
  const database = new DatabaseService()
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: config.database.url }),
  })

  beforeAll(async () => {
    await database.connect()
    await prisma.$connect()
  })

  beforeEach(async () => {
    await prisma.walletNotification.deleteMany()
    await prisma.walletWatch.deleteMany()
    await prisma.telegramSubscriber.deleteMany()
    await prisma.walletActivityEvent.deleteMany()
  })

  afterAll(async () => {
    await database.disconnect()
    await prisma.$disconnect()
  })

  async function createWatch() {
    return database.addWatch('outbox-test-chat', WALLET, 'Outbox test')
  }

  it('atomically commits unique activity, notifications and the cursor', async () => {
    const watch = await createWatch()
    const movements = [
      {
        walletAddress: WALLET,
        signature: 'outbox-one',
        direction: 'in',
        lamports: BigInt(10),
        summary: 'SOL in: 0.0000',
      },
      {
        walletAddress: WALLET,
        signature: 'outbox-two',
        direction: 'out',
        lamports: BigInt(5),
        summary: 'SOL out: 0.0000',
      },
    ]
    const notifications = [
      {
        signature: 'outbox-one',
        message: 'first',
      },
      {
        signature: 'outbox-two',
        message: 'second',
      },
    ]

    await database.commitWatchProgress({
      watchId: watch.id,
      cursor: 'outbox-one',
      movements,
      notifications,
    })
    await database.commitWatchProgress({
      watchId: watch.id,
      cursor: 'outbox-two',
      movements,
      notifications,
    })

    expect(
      await prisma.walletActivityEvent.count({
        where: { signature: { in: ['outbox-one', 'outbox-two'] } },
      }),
    ).toBe(2)
    expect(
      await prisma.walletNotification.count({ where: { watchId: watch.id } }),
    ).toBe(2)
    expect(
      (
        await prisma.walletWatch.findUniqueOrThrow({
          where: { id: watch.id },
        })
      ).lastSignature,
    ).toBe('outbox-two')
  })

  it('rolls back activity and cursor when the transaction cannot commit', async () => {
    const watch = await createWatch()
    await database.commitWatchProgress({
      watchId: watch.id,
      cursor: 'stable-cursor',
      movements: [
        {
          walletAddress: WALLET,
          signature: 'stable-event',
          direction: 'in',
          lamports: BigInt(10),
          summary: 'stable',
        },
      ],
      notifications: [
        {
          signature: 'stable-event',
          message: 'stable',
        },
      ],
    })

    await expect(
      database.commitWatchProgress({
        watchId: watch.id,
        cursor: 'must-not-stick',
        movements: [
          {
            walletAddress: WALLET,
            signature: 'rolled-back-event',
            direction: 'out',
            lamports: BigInt(5),
            summary: 'rollback',
          },
        ],
        notifications: [
          {
            signature: 'rolled-back-event',
            message: null as never,
          },
        ],
      }),
    ).rejects.toBeDefined()

    expect(
      await prisma.walletActivityEvent.count({
        where: { signature: 'rolled-back-event' },
      }),
    ).toBe(0)
    expect(
      (
        await prisma.walletWatch.findUniqueOrThrow({
          where: { id: watch.id },
        })
      ).lastSignature,
    ).toBe('stable-cursor')
  })

  it('claims once, releases failed deliveries and marks success idempotently', async () => {
    const watch = await createWatch()
    await database.commitWatchProgress({
      watchId: watch.id,
      cursor: 'claim-cursor',
      movements: [
        {
          walletAddress: WALLET,
          signature: 'claim-event',
          direction: 'in',
          lamports: BigInt(10),
          summary: 'claim',
        },
      ],
      notifications: [
        {
          signature: 'claim-event',
          message: 'claim',
        },
      ],
    })

    const [firstClaim] = await database.claimPendingNotifications(watch.id)
    expect(firstClaim).toBeDefined()
    expect(await database.claimPendingNotifications(watch.id)).toEqual([])

    await database.releaseNotificationClaim(
      firstClaim!.id,
      firstClaim!.claimToken,
    )
    const [secondClaim] = await database.claimPendingNotifications(watch.id)
    expect(secondClaim?.id).toBe(firstClaim!.id)

    expect(
      (
        await database.markNotificationDelivered(
          secondClaim!.id,
          secondClaim!.claimToken,
        )
      ).count,
    ).toBe(1)
    expect(
      (
        await database.markNotificationDelivered(
          secondClaim!.id,
          secondClaim!.claimToken,
        )
      ).count,
    ).toBe(0)
    expect(await database.claimPendingNotifications(watch.id)).toEqual([])
  })

  it('clears a stale cursor only when an inactive watch is reactivated', async () => {
    const watch = await createWatch()
    await database.updateWatchCursor(watch.id, 'stale-cursor')

    await database.removeWatch('outbox-test-chat', WALLET)
    const activeWatch = await database.addWatch(
      'outbox-test-chat',
      WALLET,
      'Reactivated',
    )
    const activeRow = await prisma.walletWatch.findUniqueOrThrow({
      where: { id: activeWatch.id },
    })

    expect(activeRow.lastSignature).toBeNull()

    await database.updateWatchCursor(watch.id, 'current-cursor')
    await database.addWatch('outbox-test-chat', WALLET, 'Already active')
    const repeatedRow = await prisma.walletWatch.findUniqueOrThrow({
      where: { id: activeWatch.id },
    })

    expect(repeatedRow.lastSignature).toBe('current-cursor')
  })
})
