import {
  classifyAuthTokenRejection,
  detectAuthTokenFormat,
  parseAuthToken,
} from '../src/auth/parseAuthToken'

describe('parseAuthToken Phase 2 observability helpers', () => {
  const legacy = {
    userId: 'user-1',
    walletAddress: 'Wallet111111111111111111111111111111111',
    subscriptionTier: 'pro',
  }
  const normalized = {
    sub: 'user-1',
    wallet: 'Wallet111111111111111111111111111111111',
    tier: 'pro' as const,
  }

  it('detectAuthTokenFormat labels legacy / normalized / dual', () => {
    expect(detectAuthTokenFormat(legacy)).toBe('legacy')
    expect(detectAuthTokenFormat(normalized)).toBe('normalized')
    expect(detectAuthTokenFormat({ ...legacy, ...normalized })).toBe('dual')
    expect(detectAuthTokenFormat({ userId: 'only-id' })).toBeNull()
    expect(detectAuthTokenFormat(null)).toBeNull()
  })

  it('accepts legacy and normalized payloads to the same user shape', () => {
    expect(parseAuthToken(legacy)).toEqual({
      id: 'user-1',
      walletAddress: 'Wallet111111111111111111111111111111111',
      subscriptionTier: 'pro',
    })
    expect(parseAuthToken(normalized)).toEqual({
      id: 'user-1',
      walletAddress: 'Wallet111111111111111111111111111111111',
      subscriptionTier: 'pro',
    })
  })

  it('accepts agreeing dual claims', () => {
    expect(parseAuthToken({ ...legacy, ...normalized }).id).toBe('user-1')
  })

  it('rejects conflicting dual claims', () => {
    expect(() =>
      parseAuthToken({
        ...legacy,
        ...normalized,
        sub: 'other-user',
      }),
    ).toThrow(/Conflicting claims/)
    expect(
      classifyAuthTokenRejection(
        new Error('Conflicting claims: legacy vs normalized'),
      ),
    ).toBe('conflict')
  })

  it('rejects incomplete tokens', () => {
    expect(() => parseAuthToken({ userId: 'x' } as never)).toThrow(/Incomplete token/)
    expect(classifyAuthTokenRejection(new Error('Incomplete token: missing'))).toBe(
      'incomplete',
    )
  })

  it('rejects mismatched iss/aud when expected', () => {
    expect(() => parseAuthToken({ ...legacy, iss: 'a' }, 'b')).toThrow(/Invalid issuer/)
    expect(() => parseAuthToken({ ...legacy, aud: 'a' }, undefined, 'b')).toThrow(
      /Invalid audience/,
    )
    expect(classifyAuthTokenRejection(new Error('Invalid issuer: expected b'))).toBe(
      'iss',
    )
    expect(classifyAuthTokenRejection(new Error('Invalid audience: expected b'))).toBe(
      'aud',
    )
  })

  it('classifies jwt verify failures without leaking payload', () => {
    expect(classifyAuthTokenRejection(new Error('jwt expired'))).toBe('verify_failed')
    expect(classifyAuthTokenRejection(new Error('invalid signature'))).toBe(
      'verify_failed',
    )
  })
})
