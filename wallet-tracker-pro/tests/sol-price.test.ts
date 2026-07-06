import { estimateUsdFromSol, lamportsToSol } from '../src/lib/portfolio'

describe('portfolio pricing helpers', () => {
  it('converts lamports and estimates USD at live or mock rates', () => {
    expect(lamportsToSol('2500000000')).toBe(2.5)
    expect(estimateUsdFromSol(2.5, 200)).toBe(500)
  })
})
