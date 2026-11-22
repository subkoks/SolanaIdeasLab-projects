/**
 * @jest-environment node
 */
import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { DatabaseService } from '../src/services/database'
import {
  createTestPrismaClient,
  describeIfTestDatabase,
} from './helpers/test-database'
import { fixtureBase58 } from './helpers/wallet-delivery'

type TestIdentity = {
  chatId: string
  signaturePrefix: string
  wallet: string
}

describeIfTestDatabase('DatabaseService watcher outbox', () => {
  let prisma: PrismaClient
  let database: DatabaseService
  const createdChatIds: string[] = []
  const createdWalletAddresses: string[] = []
  const createdWatchIds: string[] = []

  beforeAll(async () => {
    prisma = createTestPrismaClient()
    database = new DatabaseService(prisma)
    await database.connect()
  })

  afterEach(async () => {
    await prisma.walletDelivery.deleteMany({
      where: { watchId: { in: createdWatchIds } },
    })
    await prisma.walletNotification.deleteMany({
      where: { watchId: { in: createdWatchIds } },
    })
    await prisma.walletWatch.deleteMany({
      where: { id: { in: createdWatchIds } },
    })
    await prisma.walletActivityEvent.deleteMany({
      where: { walletAddress: { in: createdWalletAddresses } },
    })
    await prisma.telegramSubscriber.deleteMany({
      where: { chatId: { in: createdChatIds } },
    })
    createdChatIds.length = 0
    createdWalletAddresses.length = 0
    createdWatchIds.length = 0
  })

  afterAll(async () => {
    await database.disconnect()
  })

  const createIdentity = (): TestIdentity => {
    const suffix = randomUUID()
    const identity = {
      chatId: `outbox-test-${suffix}`,
      signaturePrefix: `outbox-${suffix}`,
      wallet: fixtureBase58(
        Number.parseInt(suffix.replaceAll('-', '').slice(0, 12), 16),
        32,
      ),
    }
    createdChatIds.push(identity.chatId)
    createdWalletAddresses.push(identity.wallet)
    return identity
  }

  async function createWatch(identity: TestIdentity) {
    const subscriber = await database.upsertSubscriber(identity.chatId)
    const watch = await database.deliveryLedger.addWatch(
      subscriber.id,
      identity.wallet,
      'Outbox test',
    )
    createdWatchIds.push(watch.id)
    return watch
  }

  it('atomically commits unique activity, notifications and the cursor', async () => {
    const identity = createIdentity()
    const watch = await createWatch(identity)
    const firstSignature = `${identity.signaturePrefix}-one`
    const secondSignature = `${identity.signaturePrefix}-two`
    const movements = [
      {
        walletAddress: identity.wallet,
        signature: firstSignature,
        direction: 'in',
        lamports: BigInt(10),
        summary: 'SOL in: 0.0000',
      },
      {
        walletAddress: identity.wallet,
        signature: secondSignature,
        direction: 'out',
        lamports: BigInt(5),
        summary: 'SOL out: 0.0000',
      },
    ]
    const notifications = [
      {
        signature: firstSignature,
        message: 'first',
      },
      {
        signature: secondSignature,
        message: 'second',
      },
    ]

    await database.commitWatchProgress({
      watchId: watch.id,
      cursor: firstSignature,
      movements,
      notifications,
    })
    await database.commitWatchProgress({
      watchId: watch.id,
      cursor: secondSignature,
      movements,
      notifications,
    })

    expect(
      await prisma.walletActivityEvent.count({
        where: {
          walletAddress: identity.wallet,
          signature: { in: [firstSignature, secondSignature] },
        },
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
    ).toBe(secondSignature)
  })

  it('rolls back activity and cursor when the transaction cannot commit', async () => {
    const identity = createIdentity()
    const watch = await createWatch(identity)
    const stableSignature = `${identity.signaturePrefix}-stable`
    const rolledBackSignature = `${identity.signaturePrefix}-rolled-back`
    await database.commitWatchProgress({
      watchId: watch.id,
      cursor: 'stable-cursor',
      movements: [
        {
          walletAddress: identity.wallet,
          signature: stableSignature,
          direction: 'in',
          lamports: BigInt(10),
          summary: 'stable',
        },
      ],
      notifications: [
        {
          signature: stableSignature,
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
            walletAddress: identity.wallet,
            signature: rolledBackSignature,
            direction: 'out',
            lamports: BigInt(5),
            summary: 'rollback',
          },
        ],
        notifications: [
          {
            signature: rolledBackSignature,
            message: null as never,
          },
        ],
      }),
    ).rejects.toBeDefined()

    expect(
      await prisma.walletActivityEvent.count({
        where: {
          walletAddress: identity.wallet,
          signature: rolledBackSignature,
        },
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
    const identity = createIdentity()
    const watch = await createWatch(identity)
    const signature = `${identity.signaturePrefix}-claim`
    await database.commitWatchProgress({
      watchId: watch.id,
      cursor: 'claim-cursor',
      movements: [
        {
          walletAddress: identity.wallet,
          signature,
          direction: 'in',
          lamports: BigInt(10),
          summary: 'claim',
        },
      ],
      notifications: [
        {
          signature,
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

  it('preserves the cursor when an inactive watch is reactivated', async () => {
    const identity = createIdentity()
    const watch = await createWatch(identity)
    await database.updateWatchCursor(watch.id, 'stale-cursor')

    await database.deliveryLedger.removeWatch(watch.subscriber.id, identity.wallet)
    const activeWatch = await database.deliveryLedger.addWatch(
      watch.subscriber.id,
      identity.wallet,
      'Reactivated',
    )
    createdWatchIds.push(activeWatch.id)
    const activeRow = await prisma.walletWatch.findUniqueOrThrow({
      where: { id: activeWatch.id },
    })

    expect(activeRow.lastSignature).toBe('stale-cursor')

    await database.updateWatchCursor(watch.id, 'current-cursor')
    await database.deliveryLedger.addWatch(
      watch.subscriber.id,
      identity.wallet,
      'Already active',
    )
    const repeatedRow = await prisma.walletWatch.findUniqueOrThrow({
      where: { id: activeWatch.id },
    })

    expect(repeatedRow.lastSignature).toBe('current-cursor')
  })
})
