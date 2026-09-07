import request from 'supertest';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { TokenSafetyBot } from '../src/index';
import {
  FIXTURE_ADDRESSES,
  isFixtureId,
  getFixtureRisk,
  type FixtureId,
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
