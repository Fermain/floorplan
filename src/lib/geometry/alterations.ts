import { cornerById } from '../model/geom'
import { systemOf, wallThickness, type UnitKey } from '../model/systems'
import type { Document, Fixture, Floor, Opening, Wall } from '../model/types'
import { WALL_HEAD } from '../plot/fixture'

// An alteration is the house as it is drawn now set against the house as built. Walls are compared by where they
// stand, not by which drawn wall they are, so a wall that has been split by a new one joining it is still the
// wall that was there. Everything else is followed by its id.

type Point = { x: number; z: number }
type Stretch = { from: number; to: number }

// A length of wall in plan, with how thick it is, for drawing over the plan.
export type WallPiece = { floorIndex: number; a: Point; b: Point; thickness: number }

export type OpeningChange = { floorIndex: number; at: Point; kind: Opening['kind']; width: number; height: number }

export type Alterations = {
  // Walls built that were not there, and walls that were there and are gone.
  built: WallPiece[]
  demolished: WallPiece[]
  // Metres of built wall that stays, is new, and has come down.
  kept: number
  builtLength: number
  demolishedLength: number
  // The same by the brick or block the walls are of, in metres of single leaf: as built, taken down, and new.
  units: Partial<Record<UnitKey, { before: number; down: number; built: number }>>
  // Openings cut into walls that stay, and openings in walls that stay that have been closed up.
  cut: OpeningChange[]
  closed: OpeningChange[]
  // Fittings put in, taken out, and moved from where they were.
  fittingsAdded: Fixture[]
  fittingsRemoved: Fixture[]
  fittingsMoved: Fixture[]
  // Other things followed by id: counters, carports, paved areas and retaining walls, put in and taken out.
  added: { counters: number; carports: number; paving: number; retaining: number }
  removed: { counters: number; carports: number; paving: number; retaining: number }
  // Whether anything at all is different.
  any: boolean
}

type Segment = { wall: Wall; a: Point; b: Point; length: number; t: Point; key: string; thickness: number; unit: UnitKey; leaves: number }

const NEAR_M = 0.03
const SLIVER_M = 0.05

function segments(floors: Floor[]): Segment[] {
  const out: Segment[] = []
  for (const floor of floors) {
    for (const wall of floor.walls) {
      if (wall.skin === 'logical') continue
      const a = cornerById(floor.corners, wall.startCornerId)
      const b = cornerById(floor.corners, wall.endCornerId)
      if (!a || !b) continue
      const length = Math.hypot(b.x - a.x, b.z - a.z)
      if (length < 1e-6) continue
      const system = systemOf(wall)
      out.push({ wall, a, b, length, t: { x: (b.x - a.x) / length, z: (b.z - a.z) / length }, key: `${wall.skin}:${system.id}`, thickness: wallThickness(system), unit: system.unitKey, leaves: system.leaves })
    }
  }
  return out
}

// The stretches of one wall that walls of the same build in another set stand along.
function covered(segment: Segment, others: Segment[]): Stretch[] {
  const stretches: Stretch[] = []
  for (const other of others) {
    if (other.key !== segment.key) continue
    const off = (p: Point) => Math.abs((p.x - segment.a.x) * -segment.t.z + (p.z - segment.a.z) * segment.t.x)
    if (off(other.a) > NEAR_M || off(other.b) > NEAR_M) continue
    const along = (p: Point) => (p.x - segment.a.x) * segment.t.x + (p.z - segment.a.z) * segment.t.z
    const from = Math.max(0, Math.min(along(other.a), along(other.b)))
    const to = Math.min(segment.length, Math.max(along(other.a), along(other.b)))
    if (to - from > 1e-6) stretches.push({ from, to })
  }
  stretches.sort((p, q) => p.from - q.from)
  const merged: Stretch[] = []
  for (const stretch of stretches) {
    const last = merged.at(-1)
    if (last && stretch.from <= last.to + 1e-6) last.to = Math.max(last.to, stretch.to)
    else merged.push({ ...stretch })
  }
  return merged
}

// What is left of a wall once the covered stretches are taken out of it, less slivers.
function gaps(length: number, stretches: Stretch[]): Stretch[] {
  const out: Stretch[] = []
  let at = 0
  for (const stretch of stretches) {
    if (stretch.from - at > SLIVER_M) out.push({ from: at, to: stretch.from })
    at = Math.max(at, stretch.to)
  }
  if (length - at > SLIVER_M) out.push({ from: at, to: length })
  return out
}

const pointOn = (segment: Segment, along: number): Point => ({ x: segment.a.x + segment.t.x * along, z: segment.a.z + segment.t.z * along })

function openingsOf(segment: Segment, floorIndex: number, standing: Stretch[]): OpeningChange[] {
  return segment.wall.openings
    .filter((opening) => {
      const middle = opening.u + opening.width / 2
      return standing.some((stretch) => middle >= stretch.from - 1e-6 && middle <= stretch.to + 1e-6)
    })
    .map((opening) => ({ floorIndex, at: pointOn(segment, opening.u + opening.width / 2), kind: opening.kind, width: opening.width, height: opening.height }))
}

const sameOpening = (p: OpeningChange, q: OpeningChange) => p.kind === q.kind && Math.hypot(p.at.x - q.at.x, p.at.z - q.at.z) < 0.05 && Math.abs(p.width - q.width) < 0.02 && Math.abs(p.height - q.height) < 0.02

function byId<T extends { id: string }>(now: T[] | undefined, before: T[] | undefined): { added: T[]; removed: T[]; both: [T, T][] } {
  const was = before ?? []
  const is = now ?? []
  return {
    added: is.filter((item) => !was.some((old) => old.id === item.id)),
    removed: was.filter((old) => !is.some((item) => item.id === old.id)),
    both: is.flatMap((item) => {
      const old = was.find((entry) => entry.id === item.id)
      return old ? [[item, old] as [T, T]] : []
    }),
  }
}

export function alterations(doc: Document): Alterations | null {
  const baseline = doc.baseline
  if (!baseline) return null
  const result: Alterations = {
    built: [],
    demolished: [],
    kept: 0,
    builtLength: 0,
    demolishedLength: 0,
    units: {},
    cut: [],
    closed: [],
    fittingsAdded: [],
    fittingsRemoved: [],
    fittingsMoved: [],
    added: { counters: 0, carports: 0, paving: 0, retaining: 0 },
    removed: { counters: 0, carports: 0, paving: 0, retaining: 0 },
    any: false,
  }
  const tally = (segment: Segment) => (result.units[segment.unit] ??= { before: 0, down: 0, built: 0 })
  const indexes = [...new Set([...doc.building.floors, ...baseline.document.building.floors].map((floor) => floor.index))].sort((a, b) => a - b)
  for (const index of indexes) {
    const now = segments(doc.building.floors.filter((floor) => floor.index === index))
    const before = segments(baseline.document.building.floors.filter((floor) => floor.index === index))
    const openNow: OpeningChange[] = []
    const openBefore: OpeningChange[] = []
    for (const segment of now) {
      const standing = covered(segment, before)
      result.kept += standing.reduce((sum, stretch) => sum + stretch.to - stretch.from, 0)
      for (const gap of gaps(segment.length, standing)) {
        result.built.push({ floorIndex: index, a: pointOn(segment, gap.from), b: pointOn(segment, gap.to), thickness: segment.thickness })
        result.builtLength += gap.to - gap.from
        tally(segment).built += (gap.to - gap.from) * segment.leaves
      }
      openNow.push(...openingsOf(segment, index, standing))
    }
    for (const segment of before) {
      const standing = covered(segment, now)
      tally(segment).before += segment.length * segment.leaves
      for (const gap of gaps(segment.length, standing)) {
        result.demolished.push({ floorIndex: index, a: pointOn(segment, gap.from), b: pointOn(segment, gap.to), thickness: segment.thickness })
        result.demolishedLength += gap.to - gap.from
        tally(segment).down += (gap.to - gap.from) * segment.leaves
      }
      openBefore.push(...openingsOf(segment, index, standing))
    }
    result.cut.push(...openNow.filter((opening) => !openBefore.some((old) => sameOpening(opening, old))))
    result.closed.push(...openBefore.filter((old) => !openNow.some((opening) => sameOpening(opening, old))))
  }

  const fixturesOf = (document: Omit<Document, 'baseline'>) => document.building.floors.flatMap((floor) => floor.fixtures ?? [])
  const fittings = byId(fixturesOf(doc), fixturesOf(baseline.document))
  result.fittingsAdded = fittings.added
  result.fittingsRemoved = fittings.removed
  result.fittingsMoved = fittings.both.filter(([item, old]) => Math.hypot(item.x - old.x, item.z - old.z) > 0.05 || item.kind !== old.kind).map(([item]) => item)

  const countersOf = (document: Omit<Document, 'baseline'>) => document.building.floors.flatMap((floor) => floor.counters ?? [])
  const others = {
    counters: byId(countersOf(doc), countersOf(baseline.document)),
    carports: byId(doc.carports, baseline.document.carports),
    paving: byId(doc.paving, baseline.document.paving),
    retaining: byId(doc.retaining, baseline.document.retaining),
  }
  for (const key of ['counters', 'carports', 'paving', 'retaining'] as const) {
    result.added[key] = others[key].added.length
    result.removed[key] = others[key].removed.length
  }
  result.any =
    result.built.length + result.demolished.length + result.cut.length + result.closed.length + result.fittingsAdded.length + result.fittingsRemoved.length + result.fittingsMoved.length > 0 ||
    Object.values(result.added).some((count) => count > 0) ||
    Object.values(result.removed).some((count) => count > 0)
  return result
}

// The share of the walls as built that still stand, by length of leaf: what the bricks already in the house are
// counted by. For one kind of brick or block, or for all of them together. Null where no wall of that kind has
// been built, so that nothing new is asked for.
export function keptShare(changes: Alterations, unit?: UnitKey): number | null {
  const tallies = unit ? [changes.units[unit] ?? { before: 0, down: 0, built: 0 }] : Object.values(changes.units)
  const sum = (pick: (item: { before: number; down: number; built: number }) => number) => tallies.reduce((total, item) => total + pick(item), 0)
  if (sum((item) => item.built) < SLIVER_M) return null
  const before = sum((item) => item.before)
  return before > 1e-6 ? Math.max(0, Math.min(1, (before - sum((item) => item.down)) / before)) : 0
}

// What has to be taken down and broken out, for pricing: wall by its face, openings cut and closed, fittings out.
export function demolition(changes: Alterations): { wall: number; cut: number; closed: number; stripped: number } {
  return {
    wall: changes.demolishedLength * WALL_HEAD,
    cut: changes.cut.length,
    closed: changes.closed.reduce((sum, opening) => sum + opening.width * opening.height, 0),
    stripped: changes.fittingsRemoved.length,
  }
}
