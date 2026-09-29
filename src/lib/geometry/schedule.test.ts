import { describe, expect, it } from 'vitest'
import type { Floor, Wall } from '../model/types'
import {
  BLOCK_HEIGHT,
  BLOCK_LENGTH,
  DEFAULT_STOREY_HEIGHT,
  LINTEL_BEARING,
} from '../plot/fixture'
import { formatSchedule, scheduleBuilding, scheduleWall } from './schedule'
import { collectLintelSpans, collectWallBlockSpans } from './walls'

const COURSE_COUNT = Math.floor(DEFAULT_STOREY_HEIGHT / BLOCK_HEIGHT)

function floorWithWall(wall: Wall, length = BLOCK_LENGTH * 5): Floor {
  return {
    id: 'f0',
    index: 0,
    datumHeight: 0,
    corners: [
      { id: wall.startCornerId, x: 0, z: 0 },
      { id: wall.endCornerId, x: length, z: 0 },
    ],
    walls: [wall],
    roomFinishes: {},
  }
}

function straightWall(overrides: Partial<Wall> = {}): Wall {
  return {
    id: 'w1',
    startCornerId: 'a',
    endCornerId: 'b',
    skin: 'single',
    openings: [],
    ...overrides,
  }
}

describe('scheduleWall', () => {
  it('counts only whole bricks for an exact-module wall with no openings', () => {
    const modules = 5
    const wall = straightWall()
    const floor = floorWithWall(wall, modules * BLOCK_LENGTH)
    const schedule = scheduleWall(floor, wall)

    expect(schedule.wholeBricks).toBe(COURSE_COUNT * modules)
    expect(schedule.cutBricks).toBe(0)
    expect(schedule.openings).toEqual({ window: 0, door: 0, external: 0, internal: 0, garage: 0 })
    expect(schedule.lintels).toEqual([])
  })

  it('groups two offcuts of one nicked module as one cut brick', () => {
    const length = BLOCK_LENGTH * 4
    const solidWall = straightWall()
    const nickU = BLOCK_LENGTH + 0.03
    const nickedWall = straightWall({
      openings: [
        {
          id: 'o1',
          u: nickU,
          v: 0,
          width: 0.05,
          height: COURSE_COUNT * BLOCK_HEIGHT,
          kind: 'window',
          aligned: false,
        },
      ],
    })
    const solidFloor = floorWithWall(solidWall, length)
    const nickedFloor = floorWithWall(nickedWall, length)
    const solid = scheduleWall(solidFloor, solidWall)
    const nicked = scheduleWall(nickedFloor, nickedWall)

    expect(collectLintelSpans(nickedFloor, nickedWall)).toEqual([])
    expect(nicked.openings.window).toBe(1)
    expect(nicked.cutBricks - solid.cutBricks).toBe(COURSE_COUNT)
    expect(solid.wholeBricks - nicked.wholeBricks).toBe(COURSE_COUNT)

    const course0Cuts = collectWallBlockSpans(nickedFloor, nickedWall).filter(
      (s) =>
        s.course === 0 &&
        s.leaf === 0 &&
        s.u0 >= BLOCK_LENGTH - 1e-6 &&
        s.u1 <= BLOCK_LENGTH * 2 + 1e-6,
    )
    expect(course0Cuts).toHaveLength(2)
  })

  it('lists a lintel without counting it as bricks', () => {
    const opening = {
      id: 'o1',
      u: 1.5,
      v: 0.9,
      width: 0.9,
      height: 1.2,
      kind: 'window' as const,
      aligned: true,
    }
    const wall = straightWall({ openings: [opening] })
    const floor = floorWithWall(wall, 4)
    const schedule = scheduleWall(floor, wall)
    const lintels = collectLintelSpans(floor, wall)

    expect(lintels).toHaveLength(1)
    expect(schedule.lintels).toHaveLength(1)
    expect(opening.u - lintels[0].u0).toBeGreaterThanOrEqual(LINTEL_BEARING - 1e-6)
    expect(lintels[0].u1 - (opening.u + opening.width)).toBeGreaterThanOrEqual(LINTEL_BEARING - 1e-6)
    expect(schedule.lintels[0].length).toBeCloseTo(lintels[0].u1 - lintels[0].u0, 5)
    expect(schedule.openings.window).toBe(1)

    const plain = straightWall()
    const plainFloor = floorWithWall(plain, 4)
    const withoutOpening = scheduleWall(plainFloor, plain)
    expect(schedule.wholeBricks + schedule.cutBricks).toBeLessThan(
      withoutOpening.wholeBricks + withoutOpening.cutBricks,
    )
  })

  it('returns an empty schedule for a logical wall', () => {
    const wall = straightWall({ skin: 'logical' })
    const floor = floorWithWall(wall)
    expect(scheduleWall(floor, wall)).toEqual({
      wholeBricks: 0,
      cutBricks: 0,
      openings: { window: 0, door: 0, external: 0, internal: 0, garage: 0 },
      lintels: [],
    })
  })

  it('counts both leaves of a double-skin wall', () => {
    const length = BLOCK_LENGTH * 3
    const single = straightWall({ skin: 'single' })
    const double = straightWall({ skin: 'double' })
    const singleFloor = floorWithWall(single, length)
    const doubleFloor = floorWithWall(double, length)
    const one = scheduleWall(singleFloor, single)
    const two = scheduleWall(doubleFloor, double)
    expect(two.wholeBricks).toBe(one.wholeBricks * 2)
    expect(two.cutBricks).toBe(one.cutBricks * 2)
  })
})

describe('formatSchedule', () => {
  it('omits the cut clause when there are no cuts', () => {
    expect(
      formatSchedule({
        wholeBricks: 42,
        cutBricks: 0,
        openings: { window: 1, door: 0, external: 0, internal: 0, garage: 0 },
        lintels: [{ length: 1.2 }],
      }),
    ).toBe('42 whole, 1 window, 1 lintel 1.20 m')
  })

  it('includes cuts openings and lintels', () => {
    expect(
      formatSchedule({
        wholeBricks: 42,
        cutBricks: 7,
        openings: { window: 1, door: 0, external: 0, internal: 0, garage: 0 },
        lintels: [{ length: 1.2 }],
      }),
    ).toBe('42 whole, 7 cut, 1 window, 1 lintel 1.20 m')
  })
})

describe('scheduleBuilding', () => {
  it('sums solid walls and ignores logical ones', () => {
    const solid = straightWall({ id: 'w1' })
    const logical = straightWall({ id: 'w2', skin: 'logical' })
    const floor: Floor = {
      id: 'f0',
      index: 0,
      datumHeight: 0,
      corners: [
        { id: 'a', x: 0, z: 0 },
        { id: 'b', x: BLOCK_LENGTH * 2, z: 0 },
        { id: 'c', x: 0, z: 2 },
        { id: 'd', x: BLOCK_LENGTH * 2, z: 2 },
      ],
      walls: [
        solid,
        { ...logical, startCornerId: 'c', endCornerId: 'd' },
      ],
      roomFinishes: {},
    }
    const doc = {
      plot: { ring: [] as [number, number][], northBearingDeg: 0, latitude: 0, longitude: 0 },
      heightfield: {
        originX: 0,
        originZ: 0,
        cellSize: 1,
        cols: 1,
        rows: 1,
        heights: [0],
      },
      building: { floors: [floor] },
    }
    const wallPart = scheduleWall(floor, solid)
    const building = scheduleBuilding(doc)
    expect(building.wholeBricks).toBe(wallPart.wholeBricks)
    expect(building.cutBricks).toBe(wallPart.cutBricks)
  })
})
