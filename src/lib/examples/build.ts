import { suggestRoomFixtures } from '../geometry/suggest'
import { gutterLayout } from '../geometry/gutters'
import { placeFixture, type FixtureSetup } from '../geometry/fixtures'
import { floorCells } from '../geometry/spaces'
import { cornerById } from '../model/geom'
import * as mutations from '../model/mutations'
import { defaultOpeningDimensions } from '../model/openings'
import { wallSystem } from '../model/systems'
import type {
  Document,
  FixtureKind,
  Floor,
  Heightfield,
  MutationResult,
  OpeningKind,
  PavingSurface,
  Plot,
  ProjectDefaults,
  Roof,
  RoomType,
  WallSkin,
  WallSystemId,
} from '../model/types'

type Point = { x: number; z: number }

const EPS = 1e-6

// Ground levels over a plot and a margin round it, from a height for each point.
export function terrain(ring: [number, number][], height: (x: number, z: number) => number, margin = 4): Heightfield {
  const xs = ring.map(([x]) => x)
  const zs = ring.map(([, z]) => z)
  const originX = Math.floor(Math.min(...xs) - margin)
  const originZ = Math.floor(Math.min(...zs) - margin)
  const cols = Math.ceil(Math.max(...xs) + margin - originX) + 1
  const rows = Math.ceil(Math.max(...zs) + margin - originZ) + 1
  const heights: number[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) heights.push(Math.round(height(originX + c, originZ + r) * 1000) / 1000)
  }
  return { originX, originZ, cellSize: 1, cols, rows, heights }
}

// Builds an example house through the same edits a person makes, failing loudly if any of them is refused.
export class Builder {
  doc: Document

  constructor(plot: Plot, heightfield: Heightfield, systemId: WallSystemId, defaults: Partial<ProjectDefaults> = {}) {
    this.doc = {
      plot,
      heightfield,
      building: {
        floors: [{ id: 'floor-0', index: 0, datumHeight: 0, corners: [], walls: [], roomFinishes: {} }],
        wallSystemId: systemId,
        defaults,
      },
    }
  }

  apply(result: MutationResult, what: string): this {
    if (!result.ok) throw new Error(`${what}: ${result.reason}`)
    this.doc = result.document
    return this
  }

  floor(index: number): Floor {
    const floor = this.doc.building.floors.find((item) => item.index === index)
    if (!floor) throw new Error(`no storey ${index}`)
    return floor
  }

  private corner(index: number, p: Point): string {
    const near = this.floor(index).corners.find((corner) => Math.hypot(corner.x - p.x, corner.z - p.z) <= EPS)
    if (near) return near.id
    this.apply(mutations.addCorner(this.doc, this.floor(index).id, p.x, p.z), `corner at ${p.x}, ${p.z}`)
    return this.floor(index).corners.at(-1)!.id
  }

  // A run of walls through the points, closed back to the first if asked.
  walls(index: number, points: Point[], options: { closed?: boolean; skin?: WallSkin; systemId?: WallSystemId } = {}): this {
    const skin = options.skin ?? 'double'
    const ids = points.map((p) => this.corner(index, p))
    const count = options.closed ? ids.length : ids.length - 1
    for (let i = 0; i < count; i++) {
      const a = ids[i]
      const b = ids[(i + 1) % ids.length]
      this.apply(mutations.addWall(this.doc, this.floor(index).id, a, b, skin, options.systemId), `wall ${i} on storey ${index}`)
    }
    return this
  }

  rect(index: number, x0: number, z0: number, x1: number, z1: number, options: { skin?: WallSkin; systemId?: WallSystemId } = {}): this {
    return this.walls(index, [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }], { ...options, closed: true })
  }

  // The wall through a point, and how far along it the point is.
  wallAt(index: number, p: Point): { id: string; u: number; length: number } {
    const floor = this.floor(index)
    for (const wall of floor.walls) {
      const a = cornerById(floor.corners, wall.startCornerId)
      const b = cornerById(floor.corners, wall.endCornerId)
      if (!a || !b) continue
      const length = Math.hypot(b.x - a.x, b.z - a.z)
      const t = { x: (b.x - a.x) / length, z: (b.z - a.z) / length }
      const u = (p.x - a.x) * t.x + (p.z - a.z) * t.z
      const off = Math.abs((p.x - a.x) * -t.z + (p.z - a.z) * t.x)
      if (off < 0.01 && u > 0.01 && u < length - 0.01) return { id: wall.id, u, length }
    }
    throw new Error(`no wall through ${p.x}, ${p.z} on storey ${index}`)
  }

  // A window or door centred on a point of a wall.
  opening(index: number, kind: OpeningKind, p: Point, width?: number): this {
    const wall = this.wallAt(index, p)
    const system = wallSystem(this.floor(index).walls.find((item) => item.id === wall.id)?.systemId ?? this.doc.building.wallSystemId)
    const span = width ?? defaultOpeningDimensions(kind, system, this.doc.building.defaults).width
    return this.apply(mutations.addOpening(this.doc, this.floor(index).id, wall.id, kind, Math.max(0, wall.u - span / 2), span), `${kind} at ${p.x}, ${p.z}`)
  }

  // Name the room round a point and fit it out as the Plan's suggestion would.
  room(index: number, p: Point, name: string, type: RoomType, fit = true): this {
    this.apply(mutations.nameCell(this.doc, this.floor(index).id, p.x, p.z, name, type), `room ${name}`)
    if (!fit) return this
    const floor = this.floor(index)
    const cells = floorCells(floor)
    const cell = cells.find((item) => pointInCell(item.ring, p))
    if (!cell) throw new Error(`no room at ${p.x}, ${p.z}`)
    const drafts = suggestRoomFixtures(this.doc, floor, cell, type, cells)
    return drafts.length > 0 ? this.apply(mutations.addFixtures(this.doc, floor.id, drafts), `fittings in ${name}`) : this
  }

  // One fitting, snapped to the nearest wall the way Plan places it.
  fixture(index: number, kind: FixtureKind, p: Point, facing: Point, setup?: FixtureSetup): this {
    const floor = this.floor(index)
    const placed = placeFixture(floor, p, kind, facing, { setup, downpipes: gutterLayout(this.doc).downpipes, plot: this.doc.plot.ring })
    if (placed.problem) throw new Error(`${kind} at ${p.x}, ${p.z}: ${placed.problem}`)
    return this.apply(mutations.addFixture(this.doc, floor.id, placed.fixture), `${kind} at ${p.x}, ${p.z}`)
  }

  // A storey over the given one; empty, it is the roof space.
  storey(index: number, at: Point): this {
    const corner = this.floor(index).corners.find((item) => Math.hypot(item.x - at.x, item.z - at.z) <= EPS)
    return this.apply(mutations.addStorey(this.doc, this.floor(index).id, corner?.id), `storey over ${index}`)
  }

  roof(index: number, roof: Roof): this {
    return this.apply(mutations.setRoof(this.doc, this.floor(index).id, roof), `roof on storey ${index}`)
  }

  // A paved area on the ground: a driveway, a path or a patio.
  paving(ring: [number, number][], surface: PavingSurface): this {
    return this.apply(mutations.addPaving(this.doc, ring, surface), `${surface} paving`)
  }

  stair(index: number, p: Point, direction: Point, width?: number): this {
    return this.apply(mutations.addStair(this.doc, this.floor(index).id, p.x, p.z, direction.x, direction.z, width), `stair at ${p.x}, ${p.z}`)
  }
}

function pointInCell(ring: { x: number; z: number }[], p: Point): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}
