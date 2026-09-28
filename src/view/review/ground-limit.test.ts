import { describe, expect, it } from 'vitest'
import { liftAboveGround } from './ground-limit'

describe('liftAboveGround', () => {
  it('raises a camera that has gone under the ground', () => {
    const lifted = liftAboveGround(-1, 2, 0, 0, 0.2)
    expect(lifted.cameraY).toBeCloseTo(0.2, 5)
    expect(lifted.targetY).toBe(2)
  })

  it('lifts the target and the camera together when the target is buried', () => {
    const lifted = liftAboveGround(1, -0.5, 0.4, 0.4, 0.2)
    expect(lifted.targetY).toBeCloseTo(0.4, 5)
    expect(lifted.cameraY).toBeCloseTo(1.9, 5)
  })
})
