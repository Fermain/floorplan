import { describe, expect, it } from 'vitest'
import { COVERINGS, fitPitch } from './coverings'

describe('fitPitch', () => {
  it('raises a pitch to the least the covering takes and leaves steeper pitches alone', () => {
    const clay = COVERINGS.find((item) => item.id === 'clay-tile')!
    expect(fitPitch(10, 'clay-tile')).toBe(clay.minPitchDeg)
    expect(fitPitch(40, 'clay-tile')).toBe(40)
    expect(fitPitch(3, 'ibr')).toBe(COVERINGS.find((item) => item.id === 'ibr')!.minPitchDeg)
  })

  it('follows the least pitch from one covering to the next', () => {
    const least = (id: string) => COVERINGS.find((item) => item.id === id)!.minPitchDeg
    expect(fitPitch(least('concrete-tile'), 'ibr', 'concrete-tile')).toBe(least('ibr'))
    expect(fitPitch(30, 'ibr', 'concrete-tile')).toBe(30)
  })
})
