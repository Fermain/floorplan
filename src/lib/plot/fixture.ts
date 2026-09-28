import type { Document, Heightfield, Plot } from '../model/types'

export const BLOCK_LENGTH = 0.232
export const BLOCK_HEIGHT = 0.083
export const BLOCK_THICKNESS = 0.106
export const CAVITY = 0.05
export const DEFAULT_STOREY_HEIGHT = 2.574
export const FLOOR_TO_FLOOR = 2.8
export const MAX_STOREYS = 4
export const DEFAULT_SILL = 0.9
export const DEFAULT_WINDOW_HEIGHT = 1.2
export const DEFAULT_WINDOW_WIDTH = 0.9
export const DEFAULT_DOOR_WIDTH = 0.813
export const DEFAULT_DOOR_HEIGHT = 2.032
export const DOOR_MIN_WIDTH = 0.6
export const OPENING_EDGE_PAD = 0.1
export const OPENING_MIN_GAP = BLOCK_LENGTH
export const LINTEL_BEARING = 0.15
export const DEFAULT_WINDOW_HEAD = DEFAULT_SILL + DEFAULT_WINDOW_HEIGHT

export const PLOT_RING: [number, number][] = [
  [0, 0],
  [18, 1],
  [22, 14],
  [8, 20],
  [-2, 11],
]

export const NORTH_BEARING_DEG = 18
export const FIXTURE_LATITUDE = -33.93
export const FIXTURE_LONGITUDE = 18.42

export const HEIGHTFIELD_ORIGIN_X = -4
export const HEIGHTFIELD_ORIGIN_Z = -4
export const HEIGHTFIELD_COLS = 28
export const HEIGHTFIELD_ROWS = 28
export const HEIGHTFIELD_CELL_SIZE = 1

function smoothstep(t: number): number {
  const u = Math.max(0, Math.min(1, t))
  return u * u * (3 - 2 * u)
}

function heightAtCell(c: number, r: number): number {
  return 0.04 * c + 1.6 * smoothstep((c + r) / 54)
}

export function buildFixtureHeights(): number[] {
  const heights: number[] = []
  for (let r = 0; r < HEIGHTFIELD_ROWS; r++) {
    for (let c = 0; c < HEIGHTFIELD_COLS; c++) {
      heights.push(heightAtCell(c, r))
    }
  }
  return heights
}

export function fixturePlot(): Plot {
  return {
    ring: PLOT_RING.map(([x, z]) => [x, z] as [number, number]),
    northBearingDeg: NORTH_BEARING_DEG,
    latitude: FIXTURE_LATITUDE,
    longitude: FIXTURE_LONGITUDE,
  }
}

export function fixtureHeightfield(): Heightfield {
  return {
    originX: HEIGHTFIELD_ORIGIN_X,
    originZ: HEIGHTFIELD_ORIGIN_Z,
    cellSize: HEIGHTFIELD_CELL_SIZE,
    cols: HEIGHTFIELD_COLS,
    rows: HEIGHTFIELD_ROWS,
    heights: buildFixtureHeights(),
  }
}

export function fixtureDocument(): Document {
  const floorId = 'floor-0'
  return {
    plot: fixturePlot(),
    heightfield: fixtureHeightfield(),
    building: {
      floors: [
        {
          id: floorId,
          index: 0,
          datumHeight: 0,
          corners: [],
          walls: [],
          roomFinishes: {},
        },
      ],
    },
  }
}
