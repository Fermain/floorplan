import { BufferGeometry, ExtrudeGeometry, Matrix4, Shape, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { cornerById } from '../model/geom'
import { isFloorOpening } from '../model/openings'
import { corniceSpec, faceTrim, skirtingSpec } from '../model/trims'
import type { CorniceType, Document, Floor, SkirtingType, Wall } from '../model/types'
import { WALL_HEAD } from '../plot/fixture'
import { finishedFloor } from './fixtures'
import { wallReach } from './outline'
import { floorCells, type WallSide } from './spaces'

type Point = { x: number; z: number }

// One stretch of a room's wall face, from corner to corner, with the way into the room.
export type TrimRun = {
  wall: Wall
  side: WallSide
  a: Point
  b: Point
  n: Point
  skirting: SkirtingType | 'none'
  cornice: CorniceType | 'none'
  // Where the skirting runs: the face less its doorways, as distances from a.
  skirtingSpans: [number, number][]
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.z * b.z
}

// The face of each room's walls: every edge of the room's inside outline that lies on a solid wall.
export function trimRuns(doc: Document, floor: Floor): TrimRun[] {
  const runs: TrimRun[] = []
  for (const cell of floorCells(floor)) {
    const ring = cell.net
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % ring.length]
      const length = Math.hypot(b.x - a.x, b.z - a.z)
      if (length < 0.05) continue
      const t = { x: (b.x - a.x) / length, z: (b.z - a.z) / length }
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
      for (const wall of floor.walls) {
        if (wall.skin === 'logical') continue
        const p = cornerById(floor.corners, wall.startCornerId)
        const q = cornerById(floor.corners, wall.endCornerId)
        if (!p || !q) continue
        const wl = Math.hypot(q.x - p.x, q.z - p.z)
        if (wl < 1e-6) continue
        const wt = { x: (q.x - p.x) / wl, z: (q.z - p.z) / wl }
        if (Math.abs(wt.x * t.z - wt.z * t.x) > 0.01) continue
        const normal = { x: -wt.z, z: wt.x }
        const across = dot({ x: mid.x - p.x, z: mid.z - p.z }, normal)
        if (Math.abs(Math.abs(across) - wallReach(wall)) > 0.02) continue
        const along = dot({ x: mid.x - p.x, z: mid.z - p.z }, wt)
        if (along < -0.01 || along > wl + 0.01) continue
        const side: WallSide = across >= 0 ? 1 : -1
        const n = { x: normal.x * side, z: normal.z * side }
        const trim = faceTrim(doc, wall, side)
        // Doorways cut the skirting: carry each floor opening from the wall onto this face.
        const uA = dot({ x: a.x - p.x, z: a.z - p.z }, wt)
        const sign = dot(t, wt) >= 0 ? 1 : -1
        let spans: [number, number][] = [[0, length]]
        for (const opening of wall.openings) {
          if (!isFloorOpening(opening.kind)) continue
          const s0 = (opening.u - uA) * sign
          const s1 = (opening.u + opening.width - uA) * sign
          const lo = Math.min(s0, s1)
          const hi = Math.max(s0, s1)
          spans = spans.flatMap(([from, to]) => {
            if (hi <= from || lo >= to) return [[from, to] as [number, number]]
            const out: [number, number][] = []
            if (lo > from) out.push([from, lo])
            if (hi < to) out.push([hi, to])
            return out
          })
        }
        runs.push({ wall, side, a, b, n, skirting: trim.skirting, cornice: trim.cornice, skirtingSpans: spans.filter(([from, to]) => to - from > 0.02) })
        break
      }
    }
  }
  return runs
}

function sweep(profile: [number, number][], from: Point, along: Point, n: Point, length: number, y: number): BufferGeometry {
  const shape = new Shape(profile.map(([x, up]) => ({ x, y: up }) as never))
  const geometry = new ExtrudeGeometry(shape, { depth: length, bevelEnabled: false })
  const basis = new Matrix4().makeBasis(new Vector3(n.x, 0, n.z), new Vector3(0, 1, 0), new Vector3(along.x, 0, along.z))
  geometry.applyMatrix4(new Matrix4().makeTranslation(from.x, y, from.z).multiply(basis))
  return geometry.index ? geometry.toNonIndexed() : geometry
}

export type TrimPart = { geometry: BufferGeometry; colour: string }

const SKIRTING_COLOUR = '#f5f2ea'
const CORNICE_COLOUR = '#fbfaf6'

// Skirting and cornice for some runs on one floor, whose datum sits at baseY.
export function buildTrimParts(runs: TrimRun[], floor: Floor, baseY: number): TrimPart[] {
  const skirting: BufferGeometry[] = []
  const cornice: BufferGeometry[] = []
  const floorY = baseY + finishedFloor(floor)
  const ceilingY = baseY + WALL_HEAD
  for (const run of runs) {
    const length = Math.hypot(run.b.x - run.a.x, run.b.z - run.a.z)
    const t = { x: (run.b.x - run.a.x) / length, z: (run.b.z - run.a.z) / length }
    if (run.skirting !== 'none') {
      const profile = skirtingSpec(run.skirting).profile
      for (const [from, to] of run.skirtingSpans) {
        skirting.push(sweep(profile, { x: run.a.x + t.x * from, z: run.a.z + t.z * from }, t, run.n, to - from, floorY))
      }
    }
    if (run.cornice !== 'none') cornice.push(sweep(corniceSpec(run.cornice).profile, run.a, t, run.n, length, ceilingY))
  }
  const out: TrimPart[] = []
  for (const [list, colour] of [[skirting, SKIRTING_COLOUR], [cornice, CORNICE_COLOUR]] as const) {
    if (list.length === 0) continue
    const merged = mergeGeometries(list, false)
    for (const geometry of list) geometry.dispose()
    if (merged) out.push({ geometry: merged, colour })
  }
  return out
}

export function trimLengths(doc: Document): { skirting: Record<SkirtingType, number>; cornice: Record<CorniceType, number> } {
  const skirting: Record<SkirtingType, number> = { rounded: 0, square: 0, angled: 0 }
  const cornice: Record<CorniceType, number> = { rounded: 0, coral: 0 }
  for (const floor of doc.building.floors) {
    for (const run of trimRuns(doc, floor)) {
      if (run.skirting !== 'none') skirting[run.skirting] += run.skirtingSpans.reduce((sum, [from, to]) => sum + to - from, 0)
      if (run.cornice !== 'none') cornice[run.cornice] += Math.hypot(run.b.x - run.a.x, run.b.z - run.a.z)
    }
  }
  return { skirting, cornice }
}
