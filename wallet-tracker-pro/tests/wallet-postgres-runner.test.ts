import { readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const { runFixture } = require('../scripts/test-delivery-postgres.cjs') as {
  runFixture(options: { spawn: jest.Mock; report: jest.Mock }): {
    receipt: { fixtureDirectory: string; startAttempted: boolean; started: boolean; stopped: boolean; stages: Array<{ stage: string; args: Array<string> }> }
    receiptPath: string; exitCode: number
  }
}

describe('owned PostgreSQL fixture lifecycle', () => {
  it.each(['accepted', 'nonzero-ack', 'timed-out-ack'])('reconciles and stops only its new cluster after %s startup', (startup) => {
    let statusReads = 0
    const spawn = jest.fn().mockImplementation((_command: string, args: Array<string>) => {
      if (args.includes('status')) return { status: ++statusReads === 1 ? 0 : 3, stdout: '', stderr: '' }
      if (args.includes('start') && startup !== 'accepted') {
        return { status: startup === 'nonzero-ack' ? 1 : null,
          error: startup === 'timed-out-ack' ? new Error('Synthetic timeout after start') : undefined,
          stdout: '', stderr: 'Synthetic lost startup acknowledgement' }
      }
      return { status: 0, stdout: '', stderr: '' }
    })
    const result = runFixture({ spawn, report: jest.fn() })
    expect(result.receipt.startAttempted).toBe(true)
    expect(result.receipt.started).toBe(startup === 'accepted')
    expect(result.receipt.stopped).toBe(true)
    expect(result.exitCode).toBe(startup === 'accepted' ? 0 : 1)
    const stopCalls = spawn.mock.calls.filter(([, args]) => args.includes('stop'))
    expect(stopCalls).toHaveLength(1)
    expect(stopCalls[0]![1]).toEqual(['-D', join(result.receipt.fixtureDirectory, 'data'), '-m', 'fast', '-t', '10', '-w', 'stop'])
    expect(dirname(result.receipt.fixtureDirectory)).toBe(realpathSync('/tmp'))
    expect(basename(result.receipt.fixtureDirectory)).toMatch(/^wallet-delivery-fixture-[A-Za-z0-9]+$/)
    expect(JSON.parse(readFileSync(result.receiptPath, 'utf8')).stopped).toBe(true)
    for (const [, args] of spawn.mock.calls) {
      if (args.includes('-D')) expect(args[args.indexOf('-D') + 1]).toBe(join(result.receipt.fixtureDirectory, 'data'))
    }
  })

  it('reports an unresolved shutdown without claiming that the process stopped', () => {
    const spawn = jest.fn().mockImplementation((_command: string, args: Array<string>) => ({
      status: args.includes('stop') ? 1 : 0, stdout: '', stderr: '',
    }))
    const result = runFixture({ spawn, report: jest.fn() })
    expect(result.exitCode).toBe(1)
    expect(result.receipt.stopped).toBe(false)
    expect(result.receipt.stages.filter((stage) => stage.stage === 'stop')).toHaveLength(1)
  })
})
