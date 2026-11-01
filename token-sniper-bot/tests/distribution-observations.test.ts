import { calculateDistribution } from '../src/utils/distribution-observations'
const row = (amount: string, index = 0) => ({ address: `offline-${index}`, amount, uiAmount: 999999 })

describe('one raw-balance basis for Sniper distribution', () => {
  it('computes exact concentration above JavaScript safe integer range without UI amounts', () => {
    const result = calculateDistribution('18014398509481986', [row('9007199254740993')])
    expect(result.percentage).toBe(50)
    expect(result.evidence).toMatchObject({ supplyRawAmount: '18014398509481986',
      top10RawAmount: '9007199254740993', sampledRawAmount: '9007199254740993',
      accountBasis: 'token-accounts', completeHolderCount: false, liquidityPoolVerified: false })
  })
  it('uses the actual ten largest raw values even when input ordering differs', () => {
    const result = calculateDistribution('1000', Array.from({ length: 12 }, (_, index) => row(index === 11 ? '500' : '1', index)))
    expect(result.percentage).toBe(50.9)
    expect(result.evidence).toMatchObject({ top10RawAmount: '509', sampledRawAmount: '511', sampledAccountCount: 12 })
  })
  it('keeps the twenty-account sample distinct from its ten-account concentration sum', () => {
    const result = calculateDistribution('1000', Array.from({ length: 20 }, (_, index) => row(String(index + 1), index)))
    expect(result.percentage).toBe(15.5)
    expect(result.evidence).toMatchObject({ top10RawAmount: '155', sampledRawAmount: '210',
      sampledAccountCount: 20, positiveSampledAccountCount: 20, sampleLimit: 20 })
  })
  it('rounds upward at hundredth-percent precision to retain exact integer-threshold comparisons', () => {
    const result = calculateDistribution('1000000000000000000', [row('200000000000000001')])
    expect(result.percentage).toBe(20.01)
    expect(result.evidence.percentageRounding).toBe('up-to-0.01-percent')
  })
  it('retains exactly 100 percent without clamping contradictory balances', () => {
    expect(calculateDistribution('18446744073709551615', [row('18446744073709551615')]).percentage).toBe(100)
  })
  it.each([
    ['zero mint supply', '0', [row('1')]],
    ['zero supply and empty accounts', '0', []],
    ['missing visible balances', '1000', []],
    ['only zero balances', '1000', [row('0')]],
    ['one amount above supply', '1000', [row('1001')]],
    ['total above supply', '1000', [row('600'), row('600', 1)]],
  ] as const)('rejects %s rather than guessing concentration', (_name, supply, accounts) => {
    expect(() => calculateDistribution(supply, [...accounts])).toThrow('Token observations unavailable')
  })
})
