import type { Document, Heightfield, Plot, WallSystemId, ProjectDefaults } from '../model/types'
import { fixtureHeightfield, fixturePlot } from './fixture'

export type SamplePlotId =
  | 'level-suburban'
  | 'gentle-north'
  | 'steep-north'
  | 'south-slope'
  | 'corner'
  | 'narrow-infill'
  | 'classic'

export type SamplePlot = {
  id: SamplePlotId
  name: string
  place: string
  description: string
  plot: Plot
  heightfield: Heightfield
}

type Slope = { towards: 'north' | 'south' | 'east' | 'west'; gradient: number }

const MARGIN_M = 4
const CELL_M = 1

function rectangle(width: number, depth: number): [number, number][] {
  return [
    [0, 0],
    [width, 0],
    [width, depth],
    [0, depth],
  ]
}

function sloped(ring: [number, number][], slope: Slope, ripple: number): Heightfield {
  const xs = ring.map(([x]) => x)
  const zs = ring.map(([, z]) => z)
  const originX = Math.floor(Math.min(...xs) - MARGIN_M)
  const originZ = Math.floor(Math.min(...zs) - MARGIN_M)
  const cols = Math.ceil(Math.max(...xs) + MARGIN_M - originX) + 1
  const rows = Math.ceil(Math.max(...zs) + MARGIN_M - originZ) + 1
  const maxX = originX + (cols - 1) * CELL_M
  const maxZ = originZ + (rows - 1) * CELL_M
  const heights: number[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = originX + c * CELL_M
      const z = originZ + r * CELL_M
      const run =
        slope.towards === 'north'
          ? maxZ - z
          : slope.towards === 'south'
            ? z - originZ
            : slope.towards === 'east'
              ? maxX - x
              : x - originX
      const wave = ripple * (Math.sin(x * 0.45) * Math.cos(z * 0.37) + 0.5 * Math.sin((x + z) * 0.21))
      heights.push(run * slope.gradient + wave)
    }
  }
  return { originX, originZ, cellSize: CELL_M, cols, rows, heights }
}

function sample(
  id: SamplePlotId,
  name: string,
  place: string,
  description: string,
  ring: [number, number][],
  location: { latitude: number; longitude: number },
  slope: Slope,
  ripple = 0.04,
  roads: number[] = [0],
): SamplePlot {
  return {
    id,
    name,
    place,
    description,
    plot: { ring, northBearingDeg: 0, ...location, roads },
    heightfield: sloped(ring, slope, ripple),
  }
}

export const SAMPLE_PLOTS: readonly SamplePlot[] = [
  sample(
    'level-suburban',
    'Level suburban plot',
    'Johannesburg',
    'A flat 15 × 30 m stand. The easiest place to start.',
    rectangle(15, 30),
    { latitude: -26.2041, longitude: 28.0473 },
    { towards: 'north', gradient: 0.004 },
    0.02,
  ),
  sample(
    'gentle-north',
    'Gentle north-facing slope',
    'Pretoria',
    'Falls about 1 in 20 towards the north, into the winter sun.',
    rectangle(20, 30),
    { latitude: -25.7479, longitude: 28.2293 },
    { towards: 'north', gradient: 1 / 20 },
  ),
  sample(
    'steep-north',
    'Steep north-facing slope',
    'Cape Town',
    'Falls about 1 in 6 to the north. Expect to step the floor or cut the ground.',
    rectangle(18, 28),
    { latitude: -33.9249, longitude: 18.4241 },
    { towards: 'north', gradient: 1 / 6 },
    0.08,
  ),
  sample(
    'south-slope',
    'South-facing slope',
    'Gqeberha',
    'Falls about 1 in 10 to the south, away from the sun. A test for winter daylight.',
    rectangle(20, 30),
    { latitude: -33.9608, longitude: 25.6022 },
    { towards: 'south', gradient: 1 / 10 },
  ),
  sample(
    'corner',
    'Wide corner plot',
    'Durban',
    'An irregular corner stand with a splayed street corner and a gentle fall to the east.',
    [
      [0, 0],
      [22, 0],
      [26, 4],
      [26, 24],
      [0, 20],
    ],
    { latitude: -29.8587, longitude: 31.0218 },
    { towards: 'east', gradient: 1 / 25 },
    0.04,
    // The two streets and the splay between them.
    [0, 1, 2],
  ),
  sample(
    'narrow-infill',
    'Narrow infill plot',
    'Bloemfontein',
    'A 10 × 35 m stand between neighbours, falling gently to the street.',
    rectangle(10, 35),
    { latitude: -29.0852, longitude: 26.1596 },
    { towards: 'south', gradient: 1 / 30 },
  ),
  {
    id: 'classic',
    name: 'Original sample plot',
    place: 'Cape Town',
    description: 'The irregular five-sided plot the editor has always opened with.',
    plot: fixturePlot(),
    heightfield: fixtureHeightfield(),
  },
]

export const DEFAULT_SAMPLE_ID: SamplePlotId = 'level-suburban'

export function samplePlot(id: SamplePlotId | string | undefined): SamplePlot {
  return SAMPLE_PLOTS.find((item) => item.id === id) ?? SAMPLE_PLOTS[0]
}

export type PlotFacts = { area: number; fall: number; facing: string | null }

const FACINGS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']

export function plotFacts(plot: Plot, field: Heightfield): PlotFacts {
  let area = 0
  for (let i = 0; i < plot.ring.length; i++) {
    const [ax, az] = plot.ring[i]
    const [bx, bz] = plot.ring[(i + 1) % plot.ring.length]
    area += ax * bz - bx * az
  }
  const at = (c: number, r: number) => field.heights[r * field.cols + c]
  let gx = 0
  let gz = 0
  for (let r = 0; r < field.rows; r++) {
    for (let c = 0; c < field.cols - 1; c++) gx += at(c + 1, r) - at(c, r)
  }
  for (let r = 0; r < field.rows - 1; r++) {
    for (let c = 0; c < field.cols; c++) gz += at(c, r + 1) - at(c, r)
  }
  gx /= Math.max(1, field.rows * (field.cols - 1)) * field.cellSize
  gz /= Math.max(1, (field.rows - 1) * field.cols) * field.cellSize
  const grade = Math.hypot(gx, gz)
  let facing: string | null = null
  if (grade > 0.01) {
    const plan = (Math.atan2(-gx, -gz) * 180) / Math.PI
    const bearing = (((plan + plot.northBearingDeg) % 360) + 360) % 360
    facing = FACINGS[Math.round(bearing / 45) % 8]
  }
  return {
    area: Math.abs(area) / 2,
    fall: Math.max(...field.heights) - Math.min(...field.heights),
    facing,
  }
}

export function levelGround(ring: [number, number][]): Heightfield {
  return sloped(ring, { towards: 'north', gradient: 0 }, 0)
}

export function documentFromSample(
  id: SamplePlotId | string,
  wallSystemId: WallSystemId,
  defaults: Partial<ProjectDefaults>,
): Document {
  const chosen = samplePlot(id)
  return documentFromSite(chosen.plot, chosen.heightfield, wallSystemId, defaults)
}

export function documentFromSite(
  plot: Plot,
  heightfield: Heightfield | null,
  wallSystemId: WallSystemId,
  defaults: Partial<ProjectDefaults>,
): Document {
  return {
    plot: structuredClone(plot),
    heightfield: structuredClone(heightfield ?? levelGround(plot.ring)),
    building: {
      floors: [{ id: 'floor-0', index: 0, datumHeight: 0, corners: [], walls: [], roomFinishes: {} }],
      wallSystemId,
      defaults: { ...defaults },
    },
  }
}
