jest.mock('@solana/web3.js', () => ({ PublicKey: class {}, Connection: jest.fn() }))
jest.mock('../src/lib/config', () => ({ config: { solana: { rpcUrl: 'http://localhost', commitment: 'confirmed' } } }))
jest.mock('../src/lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}))

import { SolanaWatcherService, MAX_WATCH_PAGES_PER_POLL } from '../src/services/solana-watcher'
import {
  DELIVERY_BATCH_SIZE,
  MAX_INGESTION_MOVEMENTS,
} from '../src/services/wallet-delivery-ledger'
import {
  deliveryStore,
  fixtureBase58,
  movement,
  watch,
} from './helpers/wallet-delivery'

const store = () => ({
  ...deliveryStore(),
  listPendingIds: jest.fn().mockResolvedValue([]),
  listWatches: jest.fn().mockResolvedValue([watch()]),
  ingest: jest.fn().mockResolvedValue('ingested'),
  getHoldCounts: jest.fn().mockResolvedValue({ uncertain: 0, dispatching: 0 }),
})

describe('serialized bounded wallet polling', () => {
  it('drains durable pending work even when there are no fresh movements', async () => {
    const ledger = store()
    ledger.listPendingIds.mockResolvedValueOnce(['pending-1'])
    const service = new SolanaWatcherService()
    const read = jest
      .spyOn(service, 'fetchNewMovementsWithCursor')
      .mockResolvedValue({ movements: [], cursor: null })
    const notify = jest.fn().mockResolvedValue({ messageId: '42' })
    await service.pollWatchlist(ledger, notify)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(ledger.ingest).not.toHaveBeenCalled()
    expect(notify.mock.invocationCallOrder[0]).toBeLessThan(read.mock.invocationCallOrder[0]!)
  })

  it('drains pending work even when no watches remain', async () => {
    const ledger = store()
    ledger.listWatches.mockResolvedValue([])
    ledger.listPendingIds.mockResolvedValueOnce(['pending-1'])
    const notify = jest.fn().mockResolvedValue({ messageId: '42' })
    await new SolanaWatcherService().pollWatchlist(ledger, notify)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it.each(['read', 'ingestion'])('isolates a held %s so a later watch still progresses', async (stage) => {
    const ledger = store()
    const first = watch({ id: 'one' })
    const second = watch({ id: 'two' })
    ledger.listWatches.mockResolvedValue([first, second])
    const service = new SolanaWatcherService()
    const read = jest
      .spyOn(service, 'fetchNewMovementsWithCursor')
      .mockResolvedValue({ movements: [movement()], cursor: movement().signature })
    if (stage === 'read') read.mockRejectedValueOnce(new Error('Synthetic history hold'))
    else ledger.ingest.mockRejectedValueOnce(new Error('Synthetic ingestion hold'))
    await service.pollWatchlist(ledger, jest.fn())
    expect(ledger.ingest).toHaveBeenCalledWith(
      second,
      [movement()],
      movement().signature,
    )
    expect(ledger.listPendingIds).toHaveBeenCalledTimes(2)
  })

  it('shares a single running poll across overlapping timer ticks', async () => {
    const ledger = store()
    ledger.listPendingIds.mockResolvedValue([])
    const service = new SolanaWatcherService()
    let finishRead!: (value: { movements: []; cursor: null }) => void
    const read = jest
      .spyOn(service, 'fetchNewMovementsWithCursor')
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            finishRead = resolve
          }),
      )
    const notify = jest.fn()
    const first = service.pollWatchlist(ledger, notify)
    const second = service.pollWatchlist(ledger, notify)
    expect(first).toBe(second)
    for (let step = 0; step < 10 && !finishRead; step++) await Promise.resolve()
    finishRead({ movements: [], cursor: null })
    await Promise.all([first, second])
    expect(read).toHaveBeenCalledTimes(1)
    expect(ledger.listWatches).toHaveBeenCalledTimes(1)
    await service.pollWatchlist({ ...ledger, listWatches: jest.fn().mockResolvedValue([]) }, notify)
  })

  it('resumes after its bounded page budget so later watches cannot starve', async () => {
    const ledger = store()
    const rows = Array.from({ length: DELIVERY_BATCH_SIZE * MAX_WATCH_PAGES_PER_POLL + 1 }, (_, index) =>
      watch({ id: `watch-${String(index + 1).padStart(4, '0')}` }))
    ledger.listWatches.mockImplementation(async (afterId: string, limit: number) => rows.filter((row) => row.id > afterId).slice(0, limit))
    const service = new SolanaWatcherService()
    const read = jest
      .spyOn(service, 'fetchNewMovementsWithCursor')
      .mockResolvedValue({ movements: [], cursor: null })
    await service.pollWatchlist(ledger, jest.fn())
    expect(ledger.listWatches).toHaveBeenCalledTimes(MAX_WATCH_PAGES_PER_POLL)
    expect(read).toHaveBeenCalledTimes(DELIVERY_BATCH_SIZE * MAX_WATCH_PAGES_PER_POLL)
    await service.pollWatchlist(ledger, jest.fn())
    expect(read).toHaveBeenCalledTimes(rows.length)
    expect(ledger.listWatches).toHaveBeenLastCalledWith(rows[rows.length - 2]!.id, DELIVERY_BATCH_SIZE)
    await service.pollWatchlist(ledger, jest.fn())
    expect(ledger.listWatches).toHaveBeenNthCalledWith(MAX_WATCH_PAGES_PER_POLL + 2, '', DELIVERY_BATCH_SIZE)
  })

  it('does not generate a direct send when ingestion reports a stale reader', async () => {
    const ledger = store()
    ledger.ingest.mockResolvedValue('stale')
    const service = new SolanaWatcherService()
    jest
      .spyOn(service, 'fetchNewMovementsWithCursor')
      .mockResolvedValue({ movements: [movement()], cursor: movement().signature })
    const notify = jest.fn()
    await service.pollWatchlist(ledger, notify)
    expect(ledger.ingest).toHaveBeenCalledTimes(1)
    expect(notify).not.toHaveBeenCalled()
  })

  it('carries transaction order across bounded ingestion chunks', async () => {
    const ledger = store()
    const signatures = Array.from(
      { length: MAX_INGESTION_MOVEMENTS + 1 },
      (_, index) => fixtureBase58(index + 1, 64),
    )
    const service = new SolanaWatcherService()
    jest.spyOn(service, 'fetchNewMovementsWithCursor').mockResolvedValue({
      movements: signatures.map((signature) => movement({ signature })),
      cursor: signatures.at(-1)!,
    })

    await service.pollWatchlist(ledger, jest.fn())

    const calls = ledger.ingest.mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[0]![1]).toHaveLength(MAX_INGESTION_MOVEMENTS)
    expect(calls[0]![2]).toBe(signatures[MAX_INGESTION_MOVEMENTS - 1])
    expect(calls[0]![3]).toBeUndefined()
    expect(calls[1]![0].lastSignature).toBe(
      signatures[MAX_INGESTION_MOVEMENTS - 1],
    )
    expect(calls[1]![1]).toEqual([
      movement({ signature: signatures[MAX_INGESTION_MOVEMENTS] }),
    ])
    expect(calls[1]![2]).toBe(signatures[MAX_INGESTION_MOVEMENTS])
    expect(calls[1]![3]).toBe(MAX_INGESTION_MOVEMENTS)
  })
})
