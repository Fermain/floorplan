import { describe, expect, it } from 'vitest'
import {
  FIXTURE_LATITUDE,
  FIXTURE_LONGITUDE,
  NORTH_BEARING_DEG,
} from '../plot/fixture'
import { summerSolstice, sunDirection, winterSolstice } from './sun'

const ANGLE_TOLERANCE_DEG = 0.5
const YEAR = 2026
const CAPE_LAT = -33.93
const CAPE_LON = 18.42

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
    const summerNoon = summerSolstice(YEAR, FIXTURE_LATITUDE)
    const winterNoon = winterSolstice(YEAR, FIXTURE_LATITUDE)
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

  it('at southern latitude December noon is higher than June noon', () => {
    const juneNoon = new Date(Date.UTC(YEAR, 5, 21, 12, 0, 0))
    const decemberNoon = new Date(Date.UTC(YEAR, 11, 21, 12, 0, 0))
    const june = sunDirection(juneNoon, CAPE_LAT, CAPE_LON, 0)
    const december = sunDirection(decemberNoon, CAPE_LAT, CAPE_LON, 0)
    expect(december.y).toBeGreaterThan(june.y)
  })

  it('at southern latitude winter solstice falls in June', () => {
    const winter = winterSolstice(YEAR, CAPE_LAT)
    expect(winter.getUTCMonth()).toBe(5)
    expect(winter.getUTCDate()).toBe(21)
  })

  it('at northern latitude 51.5 winter solstice is 21 December', () => {
    const winter = winterSolstice(YEAR, 51.5)
    expect(winter.getUTCMonth()).toBe(11)
    expect(winter.getUTCDate()).toBe(21)
  })

  it('bearing rotates horizontal azimuth by the north offset', () => {
    const date = summerSolstice(YEAR, FIXTURE_LATITUDE)
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
