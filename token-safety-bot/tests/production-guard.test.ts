import {
  assertProductionConfig,
  isProductionRuntime,
} from '../src/utils/production-guard'

describe('production guard', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('detects production runtime', () => {
    process.env.NODE_ENV = 'production'
    expect(isProductionRuntime()).toBe(true)
  })

  it('allows dev defaults outside production', () => {
    process.env.NODE_ENV = 'development'
    expect(() => assertProductionConfig()).not.toThrow()
  })

  it('rejects default JWT secret in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.JWT_SECRET = 'token-safety-bot-dev-secret'

    expect(() => assertProductionConfig()).toThrow(/JWT_SECRET/)
  })

  it('rejects skip wallet signature verify in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.JWT_SECRET = 'prod-secret-value'
    process.env.SKIP_WALLET_SIGNATURE_VERIFY = 'true'

    expect(() => assertProductionConfig()).toThrow(/SKIP_WALLET_SIGNATURE_VERIFY/)
  })
})
