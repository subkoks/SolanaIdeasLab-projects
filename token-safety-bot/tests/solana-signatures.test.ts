import {
  toSignatureActivity,
  type SignatureActivityRecord,
} from '../src/services/solana'

describe('Solana signature migration', () => {
  it('preserves web3.js v3 bigint block times without precision loss', () => {
    const rpcSignatures = [
      {
        blockTime: 1_700_000_001n,
        confirmationStatus: 'finalized',
        err: null,
        memo: null,
        signature: 'signature-1',
        slot: 123n,
      },
      {
        blockTime: null,
        confirmationStatus: 'confirmed',
        err: null,
        memo: null,
        signature: 'signature-2',
        slot: 124n,
      },
    ] as unknown as Array<SignatureActivityRecord>

    expect(toSignatureActivity(rpcSignatures)).toEqual([
      { blockTime: 1_700_000_001n, signature: 'signature-1' },
      { blockTime: null, signature: 'signature-2' },
    ])
  })
})
