import { parsePumpFunLaunchNotification } from '../src/services/helius-laserstream-parser'

describe('parsePumpFunLaunchNotification', () => {
  it('returns signature when InitializeMint2 log is present', () => {
    const payload = {
      params: {
        result: {
          signature: 'sig-laser-1',
          blockTime: 1_700_000_000,
          transaction: {
            meta: {
              logMessages: ['Program log: Instruction: InitializeMint2'],
            },
          },
        },
      },
    }

    expect(parsePumpFunLaunchNotification(payload)).toEqual({
      signature: 'sig-laser-1',
      blockTime: 1_700_000_000,
    })
  })

  it('ignores transactions without pump.fun mint init logs', () => {
    const payload = {
      params: {
        result: {
          signature: 'sig-other',
          transaction: {
            meta: {
              logMessages: ['Program log: Instruction: Transfer'],
            },
          },
        },
      },
    }

    expect(parsePumpFunLaunchNotification(payload)).toBeNull()
  })
})
