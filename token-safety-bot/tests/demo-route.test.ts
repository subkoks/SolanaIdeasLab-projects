import request from 'supertest';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { TokenSafetyBot } from '../src/index';

const VALID_BASE58 = 'So11111111111111111111111111111111111111112';

const setEnv = (env: 'development' | 'test' | 'production'): void => {
  process.env.NODE_ENV = env;
};

describe('demo route — development/test access', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    setEnv('development');
  });

  afterEach(() => {
    setEnv((originalEnv as 'development' | 'test' | 'production') ?? 'development');
  });

  it('GET /demo returns 200 with required content', async () => {
    const bot = new TokenSafetyBot();
    const res = await request(bot.getApp()).get('/demo');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Token Safety Bot');
    expect(res.text).toContain('Local Fixture Risk Demo');
    expect(res.text).toContain('LOCAL ONLY');
    expect(res.text).toContain('Run Local Analysis');
  });

  it('GET /demo contains no external assets', async () => {
    const bot = new TokenSafetyBot();
    const res = await request(bot.getApp()).get('/demo');
    const body = res.text;
    expect(body).not.toContain('http://');
    expect(body).not.toContain('https://');
    expect(body).not.toContain('cdn');
    expect(body).not.toContain('googleapis.com');
    expect(body).not.toContain('cdnjs');
    expect(body).not.toContain('unpkg');
  });

  it('GET /demo.css returns 200', async () => {
    const bot = new TokenSafetyBot();
    const res = await request(bot.getApp()).get('/demo.css');
    expect(res.status).toBe(200);
    expect(res.text.length).toBeGreaterThan(50);
  });

  it('GET /demo.js returns 200 with allowed fixture IDs only', async () => {
    const bot = new TokenSafetyBot();
    const res = await request(bot.getApp()).get('/demo.js');
    expect(res.status).toBe(200);
    expect(res.text).toContain('safe-token');
    expect(res.text).toContain('review-token');
    expect(res.text).toContain('blocked-token');
    // Same-origin relative API path must be used
    expect(res.text).toContain('/api/v1/risk/');
    expect(res.text).toContain('encodeURIComponent');
    // No live RPC/web3 wallet integration, no transaction construction
    expect(res.text).not.toContain('@solana/web3');
    expect(res.text).not.toContain('Transaction');
    expect(res.text).not.toContain('Keypair');
    expect(res.text).not.toContain('sendTransaction');
  });
});

describe('demo route — production concealment', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    setEnv('production');
  });

  afterEach(() => {
    setEnv((originalEnv as 'development' | 'test' | 'production') ?? 'development');
  });

  it('GET /demo returns 404 with generic error', async () => {
    const bot = new TokenSafetyBot();
    const res = await request(bot.getApp()).get('/demo');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
    expect(res.body).not.toHaveProperty('fixtureId');
    expect(res.body).not.toHaveProperty('source');
    expect(res.body).not.toHaveProperty('isSimulated');
    expect(res.body).not.toHaveProperty('explanation');
  });

  it('GET /demo.css returns 404', async () => {
    const bot = new TokenSafetyBot();
    const res = await request(bot.getApp()).get('/demo.css');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('GET /demo.js returns 404', async () => {
    const bot = new TokenSafetyBot();
    const res = await request(bot.getApp()).get('/demo.js');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('production response must not reveal demo names/paths', async () => {
    const bot = new TokenSafetyBot();
    const res = await request(bot.getApp()).get('/demo');
    const text = res.text || JSON.stringify(res.body);
    expect(text).not.toContain('demo.html');
    expect(text).not.toContain('fixture');
    expect(text).not.toContain('safe-token');
    expect(text).not.toContain('review-token');
    expect(text).not.toContain('blocked-token');
  });
});
