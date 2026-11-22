import {
  prepareMovements, dispatchPendingDeliveries, DELIVERY_ACK_TIMEOUT_MS, MAX_INGESTION_MOVEMENTS,
} from '../src/services/wallet-delivery-ledger'
import { deliveryStore, fixtureBase58, movement, wallet } from './helpers/wallet-delivery'

const dispatchWithoutPacing = (
  ledger: ReturnType<typeof deliveryStore>,
  notify: (chatId: string, message: string) => Promise<{ messageId: string }>,
) => dispatchPendingDeliveries(ledger, notify, {
  minChatIntervalMs: 0,
  chatLastSentAt: new Map(),
})

describe('semantic movement identities', () => {
  it('distinguishes wallets, native movement and each SPL mint for one signature', () => {
    const movements = [movement(), movement({ lamports: null, tokenMint: fixtureBase58(2, 32) }),
      movement({ lamports: null, tokenMint: fixtureBase58(3, 32) })]
    const prepared = prepareMovements(wallet, movements)
    expect(prepared.map((row) => row.movementKey)).toEqual(['sol', `spl:${fixtureBase58(2, 32)}`, `spl:${fixtureBase58(3, 32)}`])
    expect(prepared.map((row) => row.transactionOrder)).toEqual([0, 1, 2])
    expect(new Set(prepared.map((row) => row.activityId)).size).toBe(3)
    expect(prepareMovements(wallet, movements)).toEqual(prepared)
    expect(prepareMovements(fixtureBase58(2, 32), movements)[0]!.activityId).not.toBe(prepared[0]!.activityId)
  })

  it('deduplicates matching movement payloads without changing their identity', () => {
    expect(prepareMovements(wallet, [movement(), movement()])).toHaveLength(1)
    expect(prepareMovements(wallet, [movement({ lamports: null, direction: 'unknown' })])[0]!.movementKey).toBe('unknown')
  })

  it.each([
    { direction: 'out' as const, lamports: BigInt(-1) }, { summary: 'Changed' },
  ])('holds conflicting duplicates: %p', (changed) => {
    expect(() => prepareMovements(wallet, [movement(), movement(changed)])).toThrow('conflicting-movement')
  })

  it.each([
    { signature: 'invalid' }, { summary: '' }, { summary: 'x'.repeat(1025) },
    { lamports: BigInt(0) }, { lamports: BigInt(2) ** BigInt(63) },
    { direction: 'out' as const }, { tokenMint: 'invalid', lamports: null },
    { tokenMint: fixtureBase58(2, 32) }, { direction: 'in' as const, lamports: null },
    { direction: 'unknown' as const, lamports: null, tokenMint: fixtureBase58(2, 32) },
  ])('rejects an invalid movement before writing: %p', (invalid) => {
    expect(() => prepareMovements(wallet, [movement(invalid)])).toThrow('invalid-batch')
  })

  it('bounds wallet shape and retained input', () => {
    expect(() => prepareMovements('invalid', [movement()])).toThrow('invalid-batch')
    expect(() => prepareMovements(wallet, [])).toThrow('invalid-batch')
    expect(() => prepareMovements(wallet, Array.from({ length: MAX_INGESTION_MOVEMENTS + 1 }, () => movement()))).toThrow('invalid-batch')
  })
})

describe('one-time durable dispatch', () => {
  it('recovers before listing, then claims before sending and records the ACK', async () => {
    const ledger = deliveryStore()
    const notify = jest.fn().mockResolvedValue({ messageId: '42' })
    await dispatchWithoutPacing(ledger, notify)
    expect(ledger.recoverInterruptedClaims.mock.invocationCallOrder[0]).toBeLessThan(ledger.listPendingIds.mock.invocationCallOrder[0]!)
    expect(ledger.claim.mock.invocationCallOrder[0]).toBeLessThan(notify.mock.invocationCallOrder[0]!)
    expect(ledger.markSent).toHaveBeenCalledWith(await ledger.claim.mock.results[0]!.value, { messageId: '42' })
    expect(notify).toHaveBeenCalledWith('101', 'Synthetic snapshot')
    expect(ledger.markUncertain).not.toHaveBeenCalled()
  })

  it('does not send a claim owned by another poller', async () => {
    const ledger = deliveryStore()
    ledger.claim.mockResolvedValue(null)
    const notify = jest.fn()
    await dispatchWithoutPacing(ledger, notify)
    expect(notify).not.toHaveBeenCalled()
  })

  it('holds a changed watch before the network boundary', async () => {
    const ledger = deliveryStore()
    ledger.isClaimCurrent.mockResolvedValue(false)
    const notify = jest.fn()
    await dispatchWithoutPacing(ledger, notify)
    expect(notify).not.toHaveBeenCalled()
    expect(ledger.markUncertain).toHaveBeenCalledWith(expect.anything(), 'watch-changed')
  })

  it.each([undefined, {}, { messageId: '' }, { messageId: '0' }, { messageId: '1.5' }, { messageId: 42 }])(
    'holds an ambiguous or invalid acknowledgement: %p', async (receipt) => {
      const ledger = deliveryStore()
      await dispatchWithoutPacing(ledger, jest.fn().mockResolvedValue(receipt))
      expect(ledger.markSent).not.toHaveBeenCalled()
      expect(ledger.markUncertain).toHaveBeenCalledWith(expect.anything(), 'send-or-ack-failed')
    },
  )

  it.each(['rejected-send', 'lost-database-ack', 'stale-ack'])('never retries an ambiguous send: %s', async (failure) => {
    const ledger = deliveryStore()
    const notify = jest.fn().mockResolvedValue({ messageId: '42' })
    if (failure === 'rejected-send') notify.mockRejectedValue(new Error('Synthetic rejection'))
    if (failure === 'lost-database-ack') ledger.markSent.mockRejectedValue(new Error('Synthetic lost ACK'))
    if (failure === 'stale-ack') ledger.markSent.mockResolvedValue(false)
    await dispatchWithoutPacing(ledger, notify)
    ledger.claim.mockResolvedValue(null)
    await dispatchWithoutPacing(ledger, notify)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(ledger.markUncertain).toHaveBeenCalledTimes(1)
  })

  it('turns a missing ACK into a hold after a bounded wait', async () => {
    jest.useFakeTimers()
    try {
      const ledger = deliveryStore()
      const pending = dispatchWithoutPacing(ledger, () => new Promise(() => {}))
      await jest.advanceTimersByTimeAsync(DELIVERY_ACK_TIMEOUT_MS)
      await pending
      expect(ledger.markUncertain).toHaveBeenCalledWith(expect.anything(), 'send-or-ack-failed')
    } finally { jest.useRealTimers() }
  })

  it('retains the non-retryable claim when storing uncertainty also fails', async () => {
    const ledger = deliveryStore()
    ledger.markUncertain.mockRejectedValue(new Error('Synthetic database outage'))
    const notify = jest.fn().mockRejectedValue(new Error('Synthetic send rejection'))
    await expect(dispatchWithoutPacing(ledger, notify)).rejects.toThrow('Synthetic database outage')
    expect(notify).toHaveBeenCalledTimes(1)
    expect(ledger.claim).toHaveBeenCalledTimes(1)
  })

  it('keeps independent deliveries moving after a rejected send', async () => {
    const ledger = deliveryStore()
    ledger.listPendingIds.mockResolvedValue(['one', 'two'])
    ledger.claim.mockImplementation(async (id: string) => ({ id, claimToken: `claim-${id}`, chatId: '101', message: id }))
    const notify = jest.fn().mockRejectedValueOnce(new Error('Synthetic rejection')).mockResolvedValueOnce({ messageId: '42' })
    await dispatchWithoutPacing(ledger, notify)
    expect(notify).toHaveBeenCalledTimes(2)
    expect(ledger.markSent).toHaveBeenCalledTimes(1)
    expect(ledger.markUncertain).toHaveBeenCalledTimes(1)
  })
})
