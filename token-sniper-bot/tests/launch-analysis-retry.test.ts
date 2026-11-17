import { MonitorService } from '../src/services/monitor'
import type { DatabaseService } from '../src/services/database'
import type { HeliusService } from '../src/services/helius'
import type { RiskScoringService, RiskScore } from '../src/services/risk-scoring'
import type { LaunchDetectionService, DetectedLaunch } from '../src/services/launch-detection'
import type { TelegramBotService } from '../src/services/telegram-bot'
import { TokenObservationUnavailableError } from '../src/utils/token-observation-error'

const launch = (mint: string): DetectedLaunch => ({ mint, signature: `sig-${mint}`, creator: 'offline', timestampMs: 1800000000000 })
const result: RiskScore = { total: 70, riskLevel: 'medium',
  categories: { contract: 100, liquidity: 50, distribution: 50, social: 50, developer: 50 },
  factors: { renouncedMint: true, freezeAuthorityRevoked: true, liquidityLocked: null, top10Holding: 50,
    socialSentiment: 0.5, developerReputation: 50, suspiciousFunctions: false }, recommendations: [],
}
const fixture = () => {
  const database = { recordDetectedLaunch: jest.fn().mockResolvedValue(undefined), getActiveAlertsForToken: jest.fn().mockResolvedValue([]) }
  const helius = { getAssetMetadata: jest.fn().mockResolvedValue(null) }
  const scoring = { analyzeToken: jest.fn().mockResolvedValue(result) }
  const detection = { pollPumpFunLaunches: jest.fn().mockResolvedValue([]), ingestSignature: jest.fn() }
  const telegram = { broadcastLaunchAlert: jest.fn().mockResolvedValue(undefined) }
  const monitor = new MonitorService(database as unknown as DatabaseService, helius as unknown as HeliusService,
    scoring as unknown as RiskScoringService, detection as unknown as LaunchDetectionService)
  monitor.setTelegramBot(telegram as unknown as TelegramBotService)
  const poll = () => (monitor as unknown as { checkForNewTokenLaunches: () => Promise<void> }).checkForNewTokenLaunches()
  return { database, helius, scoring, detection, telegram, monitor, poll }
}

describe('launch analysis availability and bounded pre-publication retries', () => {
  it('continues after the first batch failure and recovers it without detection replay or fabricated alerts', async () => {
    const f = fixture()
    f.detection.pollPumpFunLaunches.mockResolvedValueOnce([launch('first'), launch('second')])
    f.scoring.analyzeToken.mockRejectedValueOnce(new TokenObservationUnavailableError()).mockResolvedValue(result)
    await f.poll()
    expect(f.scoring.analyzeToken.mock.calls.map(([mint]) => mint)).toEqual(['first', 'second'])
    expect(f.database.recordDetectedLaunch.mock.calls.map(([record]) => record.mint)).toEqual(['second'])
    expect(f.telegram.broadcastLaunchAlert).toHaveBeenCalledTimes(1)
    await f.poll()
    expect(f.database.recordDetectedLaunch.mock.calls.map(([record]) => record.mint)).toEqual(['second', 'first'])
    expect(f.telegram.broadcastLaunchAlert).toHaveBeenCalledTimes(2)
    expect(f.telegram.broadcastLaunchAlert.mock.calls.every(([, score]) => score === result)).toBe(true)
  })
  it('retains a failed webhook analysis for the next poll even though its signature is already deduplicated', async () => {
    const f = fixture()
    f.detection.ingestSignature.mockResolvedValueOnce(launch('webhook')).mockResolvedValue(null)
    f.scoring.analyzeToken.mockRejectedValueOnce(new TokenObservationUnavailableError()).mockResolvedValue(result)
    await expect(f.monitor.ingestLaunchSignature('sig-webhook')).resolves.toBe(false)
    expect(f.database.recordDetectedLaunch).not.toHaveBeenCalled()
    await expect(f.monitor.ingestLaunchSignature('sig-webhook')).resolves.toBe(false)
    await f.poll()
    expect(f.database.recordDetectedLaunch).toHaveBeenCalledWith(expect.objectContaining({ mint: 'webhook', riskScore: 70 }))
  })
  it('bounds persistent unavailability to three analysis attempts with no fabricated score or notifications', async () => {
    const f = fixture()
    f.detection.pollPumpFunLaunches.mockResolvedValueOnce([launch('unavailable')])
    f.scoring.analyzeToken.mockRejectedValue(new TokenObservationUnavailableError())
    for (let attempt = 0; attempt < 5; attempt += 1) await f.poll()
    expect(f.scoring.analyzeToken).toHaveBeenCalledTimes(3)
    expect(f.database.recordDetectedLaunch).not.toHaveBeenCalled()
    expect(f.telegram.broadcastLaunchAlert).not.toHaveBeenCalled()
    expect(f.helius.getAssetMetadata).not.toHaveBeenCalled()
  })
  it('retries retained analyses even while new-launch polling is unavailable', async () => {
    const f = fixture()
    f.detection.pollPumpFunLaunches.mockResolvedValueOnce([launch('retained')]).mockRejectedValue(new Error('offline poll'))
    f.scoring.analyzeToken.mockRejectedValueOnce(new TokenObservationUnavailableError()).mockResolvedValue(result)
    await f.poll()
    await f.poll()
    expect(f.database.recordDetectedLaunch).toHaveBeenCalledWith(expect.objectContaining({ mint: 'retained' }))
  })
  it('bounds retained failures to 100 mints while still attempting every newly detected launch', async () => {
    const f = fixture()
    f.detection.pollPumpFunLaunches.mockResolvedValueOnce(Array.from({ length: 101 }, (_, index) => launch(`mint-${index}`)))
    f.scoring.analyzeToken.mockRejectedValue(new TokenObservationUnavailableError())
    await f.poll()
    expect(f.scoring.analyzeToken).toHaveBeenCalledTimes(101)
    await f.poll()
    expect(f.scoring.analyzeToken).toHaveBeenCalledTimes(201)
    expect(f.database.recordDetectedLaunch).not.toHaveBeenCalled()
  })
  it('does not automatically repeat potentially partial publication side effects', async () => {
    const f = fixture()
    f.detection.pollPumpFunLaunches.mockResolvedValueOnce([launch('publication-failure')])
    f.database.recordDetectedLaunch.mockRejectedValue(new Error('offline storage'))
    await f.poll()
    await f.poll()
    expect(f.scoring.analyzeToken).toHaveBeenCalledTimes(1)
    expect(f.database.recordDetectedLaunch).toHaveBeenCalledTimes(1)
    expect(f.telegram.broadcastLaunchAlert).not.toHaveBeenCalled()
  })
})
