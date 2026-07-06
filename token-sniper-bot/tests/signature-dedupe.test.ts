import { SignatureDedupe } from '../src/utils/signature-dedupe'

describe('SignatureDedupe', () => {
  it('allows first sighting and blocks duplicates within ttl', () => {
    const dedupe = new SignatureDedupe(60_000, 100)
    const now = 1_700_000_000_000

    expect(dedupe.shouldProcess('sig-a', now)).toBe(true)
    expect(dedupe.shouldProcess('sig-a', now + 1_000)).toBe(false)
    expect(dedupe.shouldProcess('sig-b', now + 1_000)).toBe(true)
  })

  it('allows same signature after ttl expires', () => {
    const dedupe = new SignatureDedupe(1_000, 100)
    const now = 1_700_000_000_000

    expect(dedupe.shouldProcess('sig-a', now)).toBe(true)
    expect(dedupe.shouldProcess('sig-a', now + 2_000)).toBe(true)
  })
})
