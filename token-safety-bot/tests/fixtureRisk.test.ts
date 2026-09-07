import request from 'supertest';
import { describe, it, expect } from '@jest/globals';
import { TokenSafetyBot } from '../src/index';

describe('fixtureRisk adapter', () => {
  it('development: safe-token returns 200 with fixture provenance', async () => {
    const bot = new TokenSafetyBot();
    const app = bot.getApp();
    const res = await request(app).get(
      '/api/v1/risk/So11111111111111111111111111111111111111112?fixture=safe-token',
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      source: 'local-fixture',
      fixtureId: 'safe-token',
      isSimulated: true,
      recommendation: 'allow',
      safetyLevel: 'safe',
    });
    expect(typeof res.body.tokenAddress).toBe('string');
  });

  it('development: review-token returns review with deterministic data', async () => {
    const bot = new TokenSafetyBot();
    const res = await request(bot.getApp()).get(
      '/api/v1/risk/So11111111111111111111111111111111111111112?fixture=review-token',
    );
    expect(res.status).toBe(200);
    expect(res.body.recommendation).toBe('review');
    expect(res.body.safetyLevel).toBe('watch');
    expect(res.body.source).toBe('local-fixture');
    expect(res.body.isSimulated).toBe(true);
  });

  it('development: blocked-token returns block with high-risk indicators', async () => {
    const bot = new TokenSafetyBot();
    const res = await request(bot.getApp()).get(
      '/api/v1/risk/So11111111111111111111111111111111111111112?fixture=blocked-token',
    );
    expect(res.status).toBe(200);
    expect(res.body.recommendation).toBe('block');
    expect(res.body.safetyLevel).toBe('dangerous');
    expect(res.body.source).toBe('local-fixture');
  });

  it('development: unknown fixture returns 400, no live risk service called', async () => {
    const bot = new TokenSafetyBot();
    const res = await request(bot.getApp()).get(
      '/api/v1/risk/So11111111111111111111111111111111111111112?fixture=unknown-fixture',
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Unknown fixture');
  });

  it('development: empty fixture returns validation error', async () => {
    const bot = new TokenSafetyBot();
    const res = await request(bot.getApp()).get(
      '/api/v1/risk/So11111111111111111111111111111111111111112?fixture=',
    );
    expect(res.status).toBe(400);
  });
});

describe('fixture production gate', () => {
  const originalEnv = process.env.NODE_ENV;

  it('production: fixture query returns 404 without exposing IDs', async () => {
    process.env.NODE_ENV = 'production';
    const bot = new TokenSafetyBot();
    const res = await request(bot.getApp()).get(
      '/api/v1/risk/So11111111111111111111111111111111111111112?fixture=safe-token',
    );
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
    expect(res.body).not.toHaveProperty('fixtureId');
    process.env.NODE_ENV = originalEnv;
  });
});
