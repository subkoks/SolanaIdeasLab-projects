import request from 'supertest';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { TokenSafetyBot } from '../src/index';
import {
  FIXTURE_ADDRESSES,
  isFixtureId,
  getFixtureRisk,
  type FixtureId,
  type FixtureSignalSeverity,
  type FixtureRiskExplanation,
} from '../src/services/fixtureRiskAdapter';
import { SafetyScannerService } from '../src/services/safety-scanner';

const VALID_BASE58 = 'So11111111111111111111111111111111111111112';

const setEnv = (env: 'development' | 'test' | 'production'): void => {
  process.env.NODE_ENV = env;
};

describe('fixture adapter is pure and deterministic', () => {
  it('returns the fixed synthetic address per fixture ID', () => {
    expect(getFixtureRisk('safe-token').tokenAddress).toBe(
      FIXTURE_ADDRESSES['safe-token'],
    );
    expect(getFixtureRisk('blocked-token').tokenAddress).toBe(
      FIXTURE_ADDRESSES['blocked-token'],
    );
  });

  it('results are deterministic across repeated calls', () => {
    const a = getFixtureRisk('review-token');
    const b = getFixtureRisk('review-token');
    expect(a).toEqual(b);
  });

  it('only supports the three fixture IDs', () => {
    expect(isFixtureId('safe-token')).toBe(true);
    expect(isFixtureId('fake')).toBe(false);
    expect(isFixtureId('')).toBe(false);
  });
});

describe('fixture route behavior (development)', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    setEnv('development');
  });

  afterEach(() => {
    setEnv((originalEnv as 'development' | 'test' | 'production') ?? 'development');
  });

  const fixtureIds: FixtureId[] = ['safe-token', 'review-token', 'blocked-token'];
  for (const id of fixtureIds) {
    it(`${id}: returns 200 with fixture provenance and getAgentRisk is not called`, async () => {
      const spy = jest.spyOn(
        SafetyScannerService.prototype,
        'getAgentRisk',
      );
      const bot = new TokenSafetyBot();
      const res = await request(bot.getApp()).get(
        `/api/v1/risk/${VALID_BASE58}?fixture=${id}`,
      );
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        source: 'local-fixture',
        fixtureId: id,
        isSimulated: true,
      });
      expect(res.body.tokenAddress).toBe(FIXTURE_ADDRESSES[id]);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  }

  it('unknown fixture returns 400 and getAgentRisk is not called', async () => {
    const spy = jest.spyOn(SafetyScannerService.prototype, 'getAgentRisk');
    const bot = new TokenSafetyBot();
    const res = await request(bot.getApp()).get(
      `/api/v1/risk/${VALID_BASE58}?fixture=unknown-fixture`,
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Unknown fixture');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('empty fixture returns 400 and getAgentRisk is not called', async () => {
    const spy = jest.spyOn(SafetyScannerService.prototype, 'getAgentRisk');
    const bot = new TokenSafetyBot();
    const res = await request(bot.getApp()).get(
      `/api/v1/risk/${VALID_BASE58}?fixture=`,
    );
    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('fixture response uses fixed synthetic address, not caller path address', async () => {
    const bot = new TokenSafetyBot();
    const res = await request(bot.getApp()).get(
      `/api/v1/risk/${VALID_BASE58}?fixture=safe-token`,
    );
    expect(res.body.tokenAddress).toBe(FIXTURE_ADDRESSES['safe-token']);
    expect(res.body.tokenAddress).not.toBe(VALID_BASE58);
  });

  it('fixture results are deterministic across repeated requests', async () => {
    const bot = new TokenSafetyBot();
    const r1 = await request(bot.getApp()).get(
      `/api/v1/risk/${VALID_BASE58}?fixture=blocked-token`,
    );
    const r2 = await request(bot.getApp()).get(
      `/api/v1/risk/${VALID_BASE58}?fixture=blocked-token`,
    );
    expect(r1.status).toBe(200);
    expect(r1.body).toEqual(r2.body);
  });
});

describe('fixture production gate — before address validation', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    setEnv('production');
  });

  afterEach(() => {
    setEnv((originalEnv as 'development' | 'test' | 'production') ?? 'development');
  });

  it('production: fixture query on invalid address returns 404 before address validation', async () => {
    const spy = jest.spyOn(SafetyScannerService.prototype, 'getAgentRisk');
    const bot = new TokenSafetyBot();
    const res = await request(bot.getApp()).get(
      '/api/v1/risk/not-a-valid-solana-address?fixture=safe-token',
    );
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
    expect(res.body).not.toHaveProperty('fixtureId');
    expect(res.body).not.toHaveProperty('source');
    expect(res.body).not.toHaveProperty('isSimulated');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('production: fixture query on valid address returns 404, getAgentRisk not called', async () => {
    const spy = jest.spyOn(SafetyScannerService.prototype, 'getAgentRisk');
    const bot = new TokenSafetyBot();
    const res = await request(bot.getApp()).get(
      `/api/v1/risk/${VALID_BASE58}?fixture=safe-token`,
    );
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('normal non-fixture request — getAgentRisk called with correct args', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    setEnv('development');
  });

  afterEach(() => {
    setEnv((originalEnv as 'development' | 'test' | 'production') ?? 'development');
  });

  it('non-fixture request calls getAgentRisk exactly once with address and depth', async () => {
    const spy = jest
      .spyOn(SafetyScannerService.prototype, 'getAgentRisk')
      .mockResolvedValue({
        schemaVersion: '1',
        decision: { recommendation: 'review', safetyLevel: 'watch', score: 55 },
        evidence: {
          blacklisted: false,
          contractAuthoritiesPresent: [],
          holderCount: 0,
          recentActivityCount: 0,
          tokenProgram: 'spl-token' as const,
          topHolderOwnershipRatio: 0,
        },
        provenance: {
          analysisDepth: 'deep',
          generatedAt: '2026-09-07T00:00:00.000Z',
          sources: [
            {
              id: 'local-blacklist',
              fields: ['blacklisted'],
              observedAt: '2026-09-07T00:00:00.000Z',
            },
          ],
        },
        signals: {
          greenFlags: [],
          recommendations: [],
          redFlags: [],
          truncated: false,
        },
        tokenAddress: VALID_BASE58,
      } as never);
    const bot = new TokenSafetyBot();
    const res = await request(bot.getApp()).get(
      `/api/v1/risk/${VALID_BASE58}?analysisDepth=deep`,
    );
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(VALID_BASE58, 'deep');
    expect(res.body).not.toHaveProperty('fixtureId');
    expect(res.body).not.toHaveProperty('isSimulated');
    expect(res.body).not.toHaveProperty('source', 'local-fixture');
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Explainable fixture reports (additive only)
// ---------------------------------------------------------------------------

describe('fixture explanation contract', () => {
  const validSeverities: FixtureSignalSeverity[] = ["positive", "warning", "critical"];

  it('safe-token: explanation exists with positive signals, non-empty fields', () => {
    const result = getFixtureRisk('safe-token');
    expect(result).toHaveProperty('explanation');
    const exp = result.explanation;
    expect(typeof exp.summary).toBe('string');
    expect(exp.summary.length).toBeGreaterThan(0);
    expect(typeof exp.nextAction).toBe('string');
    expect(exp.nextAction.length).toBeGreaterThan(0);
    expect(Array.isArray(exp.signals)).toBe(true);
    expect(exp.signals.length).toBeGreaterThanOrEqual(2);
    const ids = exp.signals.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length); // unique
    for (const s of exp.signals) {
      expect(typeof s.id).toBe('string');
      expect(s.id.length).toBeGreaterThan(0);
      expect(validSeverities).toContain(s.severity);
      expect(typeof s.title).toBe('string');
      expect(s.title.length).toBeGreaterThan(0);
      expect(typeof s.detail).toBe('string');
      expect(s.detail.length).toBeGreaterThan(0);
    }
    const hasPositive = exp.signals.some((s) => s.severity === 'positive');
    expect(hasPositive).toBe(true);
    const hasCritical = exp.signals.some((s) => s.severity === 'critical');
    expect(hasCritical).toBe(false);
  });

  it('review-token: explanation with at least one warning, non-empty fields', () => {
    const result = getFixtureRisk('review-token');
    expect(result).toHaveProperty('explanation');
    const exp = result.explanation;
    expect(exp.summary.length).toBeGreaterThan(0);
    expect(exp.nextAction.length).toBeGreaterThan(0);
    expect(exp.signals.length).toBeGreaterThanOrEqual(2);
    const warnings = exp.signals.filter((s) => s.severity === 'warning');
    expect(warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('blocked-token: explanation with at least two critical signals', () => {
    const result = getFixtureRisk('blocked-token');
    expect(result).toHaveProperty('explanation');
    const exp = result.explanation;
    expect(exp.summary.length).toBeGreaterThan(0);
    expect(exp.nextAction.length).toBeGreaterThan(0);
    expect(exp.signals.length).toBeGreaterThanOrEqual(2);
    const criticals = exp.signals.filter((s) => s.severity === 'critical');
    expect(criticals.length).toBeGreaterThanOrEqual(2);
  });

  it('determinism: repeated requests return identical explanation payloads', () => {
    for (const id of ['safe-token', 'review-token', 'blocked-token'] as FixtureId[]) {
      const a = getFixtureRisk(id);
      const b = getFixtureRisk(id);
      expect(a.explanation).toEqual(b.explanation);
      expect(a.explanation.signals).toEqual(b.explanation.signals);
    }
  });

  it('signal order remains stable', () => {
    for (const id of ['safe-token', 'review-token', 'blocked-token'] as FixtureId[]) {
      const ids = getFixtureRisk(id).explanation.signals.map((s) => s.id);
      const ids2 = getFixtureRisk(id).explanation.signals.map((s) => s.id);
      expect(ids).toEqual(ids2);
    }
  });
});

describe('fixture explanation under route-level isolation', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    setEnv('development');
  });

  afterEach(() => {
    setEnv((originalEnv as 'development' | 'test' | 'production') ?? 'development');
  });

  const fixtureIds: FixtureId[] = ['safe-token', 'review-token', 'blocked-token'];
  for (const id of fixtureIds) {
    it(`${id}: explanation present in response with valid signal severity`, async () => {
      const bot = new TokenSafetyBot();
      const res = await request(bot.getApp()).get(
        `/api/v1/risk/${VALID_BASE58}?fixture=${id}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.explanation).toBeDefined();
      expect(typeof res.body.explanation.summary).toBe('string');
      expect(typeof res.body.explanation.nextAction).toBe('string');
      expect(Array.isArray(res.body.explanation.signals)).toBe(true);
      for (const s of res.body.explanation.signals) {
        expect(['positive', 'warning', 'critical']).toContain(s.severity);
      }
    });
  }

  it('existing isolation preserved: fixture path does not call getAgentRisk', async () => {
    const spy = jest.spyOn(SafetyScannerService.prototype, 'getAgentRisk');
    const bot = new TokenSafetyBot();
    const res = await request(bot.getApp()).get(
      `/api/v1/risk/${VALID_BASE58}?fixture=safe-token`,
    );
    expect(res.status).toBe(200);
    expect(res.body.explanation).toBeDefined();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('production: fixture response does not expose explanation or signal details', async () => {
    setEnv('production');
    const spy = jest.spyOn(SafetyScannerService.prototype, 'getAgentRisk');
    const bot = new TokenSafetyBot();
    const res = await request(bot.getApp()).get(
      `/api/v1/risk/${VALID_BASE58}?fixture=safe-token`,
    );
    expect(res.status).toBe(404);
    expect(res.body).not.toHaveProperty('explanation');
    expect(res.body).not.toHaveProperty('fixtureId');
    expect(res.body).not.toHaveProperty('signals');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    setEnv('development');
  });
});
