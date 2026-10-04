import { counterFace } from '../geometry/counters'
import { suggestRoomFixtures } from '../geometry/suggest'
import { gutterLayout } from '../geometry/gutters'
import { placeFixture, type FixtureSetup } from '../geometry/fixtures'
import { floorCells } from '../geometry/spaces'
import { cornerById } from '../model/geom'
import * as mutations from '../model/mutations'
import { defaultOpeningDimensions } from '../model/openings'
import { wallSystem } from '../model/systems'
import type {
  Carport,
  CarportRoof,
  CounterTop,
  RetainingType,
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

  // A roof straight over the building that has a corner at the given point: a new storey for that building alone,
  // with the roof on it. For a plot with several buildings, where a storey index names more than one floor.
  cover(at: Point, roof: Roof): this {
    this.storey(0, at)
    const top = this.doc.building.floors.at(-1)!
    return this.apply(mutations.setRoof(this.doc, top.id, roof), `roof over ${at.x}, ${at.z}`)
  }

  roof(index: number, roof: Roof): this {
    return this.apply(mutations.setRoof(this.doc, this.floor(index).id, roof), `roof on storey ${index}`)
  }

  // A paved area on the ground: a driveway, a path or a patio.
  paving(ring: [number, number][], surface: PavingSurface): this {
    return this.apply(mutations.addPaving(this.doc, ring, surface), `${surface} paving`)
  }

  // A carport standing free: its middle, the way its cars drive in, how many it takes and what it is roofed with.
  carport(at: Point, direction: Point, bays: Carport['bays'], roof: CarportRoof): this {
    const length = Math.hypot(direction.x, direction.z) || 1
    return this.apply(mutations.addCarport(this.doc, { x: at.x, z: at.z, dx: direction.x / length, dz: direction.z / length, bays, roof }), `carport at ${at.x}, ${at.z}`)
  }

  // A counter along the wall the room's sink stands against, with the sink set into it. It runs up to `reach`
  // either side of the sink, stopping short of a door, the end of the wall, or a stove standing in its way.
  // With builtIn, the room's stove becomes a hob in the worktop and the counter runs through it.
  counters(index: number, p: Point, options: { top?: CounterTop; wallUnits?: boolean; builtIn?: boolean; reach?: number } = {}): this {
    const cellOf = () => floorCells(this.floor(index)).find((item) => pointInCell(item.ring, p))
    const cell = cellOf()
    if (!cell) throw new Error(`no room at ${p.x}, ${p.z}`)
    const inRoom = (kinds: FixtureKind[]) => (this.floor(index).fixtures ?? []).filter((item) => kinds.includes(item.kind) && pointInCell(cell.ring, item))
    const sink = inRoom(['sink'])[0]
    if (!sink) throw new Error(`no sink in the room at ${p.x}, ${p.z}`)
    const behind = { x: sink.x - sink.dx * 0.25, z: sink.z - sink.dz * 0.25 }
    if (options.builtIn) {
      // Only a stove on the sink's own wall: one across the room stays a stove standing on its own.
      const wallId = counterFace(this.floor(index), behind, 0.45)?.wallId
      for (const stove of inRoom(['stove', 'gas-stove'])) {
        const back = { x: stove.x - stove.dx * 0.25, z: stove.z - stove.dz * 0.25 }
        if (wallId && counterFace(this.floor(index), back, 0.45)?.wallId === wallId) {
          this.apply(mutations.updateFixture(this.doc, this.floor(index).id, stove.id, { builtIn: true }), 'built-in hob')
        }
      }
    }
    const floor = this.floor(index)
    const face = counterFace(floor, behind, 0.45)
    if (!face) throw new Error(`no wall behind the sink at ${sink.x}, ${sink.z}`)
    const { dir, point } = face
    const at = (q: Point) => (q.x - point.x) * dir.x + (q.z - point.z) * dir.z
    const middle = at(sink)
    const reach = options.reach ?? 1.8
    const CORNER_M = 0.14
    let from = Math.max(-face.before + CORNER_M, middle - reach)
    let to = Math.min(face.after - CORNER_M, middle + reach)
    for (const span of face.spans) {
      if (!span.stop) continue
      if (span.from >= middle) to = Math.min(to, span.from)
      else from = Math.max(from, span.to)
    }
    // Doors in this wall, as stretches along the face.
    const wall = floor.walls.find((item) => item.id === face.wallId)!
    const start = cornerById(floor.corners, wall.startCornerId)!
    const end = cornerById(floor.corners, wall.endCornerId)!
    const length = Math.hypot(end.x - start.x, end.z - start.z)
    const t = { x: (end.x - start.x) / length, z: (end.z - start.z) / length }
    const way = dir.x * t.x + dir.z * t.z > 0 ? 1 : -1
    const origin = (point.x - start.x) * t.x + (point.z - start.z) * t.z
    let window = false
    const stretches = wall.openings.map((opening) => {
      const ends = [(opening.u - origin) * way, (opening.u + opening.width - origin) * way]
      return { kind: opening.kind, from: Math.min(...ends), to: Math.max(...ends) }
    })
    for (const stretch of stretches) {
      if (stretch.kind === 'window') continue
      if (stretch.from >= middle) to = Math.min(to, stretch.from - 0.1)
      else from = Math.max(from, stretch.to + 0.1)
    }
    const half = 0.6
    from = Math.min(Math.ceil(from * 20 - 1e-6) / 20, middle - half)
    to = Math.max(Math.floor(to * 20 + 1e-6) / 20, middle + half)
    for (const stretch of stretches) if (stretch.kind === 'window' && stretch.to > from && stretch.from < to) window = true
    return this.apply(
      mutations.addCounter(this.doc, floor.id, {
        x: point.x + dir.x * from,
        z: point.z + dir.z * from,
        dx: dir.x,
        dz: dir.z,
        length: to - from,
        depth: 0.6,
        kind: 'base',
        top: options.top ?? 'laminate',
        // No cupboards across a window.
        ...(options.wallUnits && !window ? { wallUnits: true } : {}),
      }),
      `counter in the room at ${p.x}, ${p.z}`,
    )
  }

  // An island or a bar standing free: its middle, the way it runs, its length and its worktop.
  island(index: number, at: Point, direction: Point, length: number, top: CounterTop = 'granite', kind: 'island' | 'bar' = 'island'): this {
    const depth = kind === 'bar' ? 0.4 : 0.9
    const size = Math.hypot(direction.x, direction.z) || 1
    const dir = { x: direction.x / size, z: direction.z / size }
    const out = { x: -dir.z, z: dir.x }
    return this.apply(
      mutations.addCounter(this.doc, this.floor(index).id, {
        x: at.x - (dir.x * length) / 2 - (out.x * depth) / 2,
        z: at.z - (dir.z * length) / 2 - (out.z * depth) / 2,
        dx: dir.x,
        dz: dir.z,
        length,
        depth,
        kind,
        top,
      }),
      `island at ${at.x}, ${at.z}`,
    )
  }

  // A retaining wall along the foot of a bank.
  retaining(points: [number, number][], type: RetainingType): this {
    return this.apply(mutations.addRetainingWall(this.doc, { type, points }), `retaining wall from ${points[0][0]}, ${points[0][1]}`)
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
