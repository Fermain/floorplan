import { OrthographicCamera } from 'three'
import { describe, expect, it } from 'vitest'
import { configureOrthoCamera, roundTripMaxError } from './elevation'

function makeElevationCamera(aspect: number): OrthographicCamera {
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
  configureOrthoCamera(camera, aspect)
  return camera
}

describe('elevation unproject', () => {
  it('round-trips a mid-wall point within 5 mm', () => {
    const camera = makeElevationCamera(4 / 3)
    expect(roundTripMaxError(camera, 2, 1.2)).toBeLessThan(0.005)
  })

  it('round-trips a point within 50 mm of corner A within 5 mm', () => {
    const camera = makeElevationCamera(16 / 9)
    expect(roundTripMaxError(camera, 0.035, 0.035)).toBeLessThan(0.005)
  })

  it('round-trips near the opposite corner within 5 mm', () => {
    const camera = makeElevationCamera(1)
    expect(roundTripMaxError(camera, 3.96, 2.36)).toBeLessThan(0.005)
  })
})
