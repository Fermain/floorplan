import { describe, expect, it } from 'vitest'
import {
  FIXTURE_LATITUDE,
  FIXTURE_LONGITUDE,
  NORTH_BEARING_DEG,
} from '../plot/fixture'
import { summerSolstice, sunDirection, winterSolstice } from './sun'

const ANGLE_TOLERANCE_DEG = 0.5
const YEAR = 2026

function unitLength(v: { x: number; y: number; z: number }): number {
  return Math.hypot(v.x, v.y, v.z)
}

function horizontalAngleDeg(v: { x: number; z: number }): number {
  return (Math.atan2(v.x, v.z) * 180) / Math.PI
}

function normalizeAngleDeltaDeg(delta: number): number {
  let d = delta
  while (d > 180) d -= 360
  while (d <= -180) d += 360
  return d
}

describe('sun kernel', () => {
  it('summer noon is higher than winter noon at the fixture', () => {
    const summerNoon = summerSolstice(YEAR)
    const winterNoon = winterSolstice(YEAR)
    const summer = sunDirection(
      summerNoon,
      FIXTURE_LATITUDE,
      FIXTURE_LONGITUDE,
      NORTH_BEARING_DEG,
    )
    const winter = sunDirection(
      winterNoon,
      FIXTURE_LATITUDE,
      FIXTURE_LONGITUDE,
      NORTH_BEARING_DEG,
    )

    expect(Number.isFinite(summer.y)).toBe(true)
    expect(Number.isFinite(winter.y)).toBe(true)
    expect(unitLength(summer)).toBeCloseTo(1, 6)
    expect(unitLength(winter)).toBeCloseTo(1, 6)
    expect(summer.y).toBeGreaterThan(winter.y)
  })

  it('bearing rotates horizontal azimuth by the north offset', () => {
    const date = summerSolstice(YEAR)
    const withBearing = sunDirection(
      date,
      FIXTURE_LATITUDE,
      FIXTURE_LONGITUDE,
      NORTH_BEARING_DEG,
    )
    const withoutBearing = sunDirection(
      date,
      FIXTURE_LATITUDE,
      FIXTURE_LONGITUDE,
      0,
    )
    const delta = normalizeAngleDeltaDeg(
      horizontalAngleDeg(withBearing) - horizontalAngleDeg(withoutBearing),
    )
    expect(Math.abs(Math.abs(delta) - NORTH_BEARING_DEG)).toBeLessThan(
      ANGLE_TOLERANCE_DEG,
    )
  })
})
