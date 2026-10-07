import { BufferGeometry, CylinderGeometry, Matrix4, Quaternion, SphereGeometry, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { fixtureSize, fixtureSpec } from '../model/fixtures'
import type { Document, Fixture, Floor } from '../model/types'
import { WALL_HEAD } from '../plot/fixture'
import { electricalLayout } from './electrical'
import { finishedFloor, siteField } from './fixtures'
import { GAS_RUN_Y, gasLayout } from './gas'
import { groundPad, pointInRing, ringDistance } from './pad'
import { COLD, GEYSERS, HOT, plumbingLayout, servicePath } from './plumbing'
import { bilinearHeight } from './terrain'

// The services of a house as runs through space, for seeing through the walls in Review. Like the layouts they
// come from, they are indicative: where a pipe or a cable would go, not a drawing to build from.
export type ServiceKind = 'drain' | 'cold' | 'hot' | 'lights' | 'plugs' | 'heavy' | 'gas'
export type ServiceRun = { kind: ServiceKind; radius: number; points: [number, number, number][] }

export const SERVICE_KINDS: { id: ServiceKind; name: string; colour: string }[] = [
  { id: 'drain', name: 'Drains', colour: '#8b5a2b' },
  { id: 'cold', name: 'Cold water', colour: '#2563eb' },
  { id: 'hot', name: 'Hot water', colour: '#dc2626' },
  { id: 'lights', name: 'Lighting', colour: '#eab308' },
  { id: 'plugs', name: 'Plugs', colour: '#f97316' },
  { id: 'heavy', name: 'Stove and geyser', colour: '#a855f7' },
  { id: 'gas', name: 'Gas', colour: '#65a30d' },
]

type Placed = { floor: Floor; fixture: Fixture }
type P3 = [number, number, number]

const WATER_DEPTH_M = 0.45
const TAP_M = 0.5
// Between buildings a run goes in a trench this deep, not through the air; and how near a wall a fitting outside
// it has to be to count as part of that building.
const TRENCH_DEPTH_M = 0.5
const TRENCH_STEP_M = 2
const BUILDING_REACH_M = 1.5
// Runs that share a ceiling are stepped apart a little so each can be told from the others.
const LIFT: Record<ServiceKind, number> = { drain: 0, cold: 0, hot: 0.07, lights: 0.14, plugs: 0.2, heavy: 0.26, gas: 0 }

// Along one way and then the other, at one height, the way a pipe or a cable is run square to the walls.
function square(from: { x: number; z: number }, to: { x: number; z: number }, y: number): P3[] {
  return [
    [from.x, y, from.z],
    [to.x, y, from.z],
    [to.x, y, to.z],
  ]
}

export function serviceRuns(doc: Document): ServiceRun[] {
  const runs: ServiceRun[] = []
  const pad = groundPad(doc)
  const field = siteField(doc)
  const ground = (x: number, z: number) => bilinearHeight(field, x, z)
  const slab = (floor: Floor, at: { x: number; z: number }) => {
    const structures = pad?.structures ?? []
    const datum = structures.find((structure) => structure.rings.some((ring) => pointInRing(ring, at.x, at.z)))?.datum ?? structures[0]?.datum ?? 0
    return floor.datumHeight + datum
  }
  const floorOf = (item: Placed) => slab(item.floor, item.fixture) + finishedFloor(item.floor)
  const ceilingOf = (item: Placed, kind: ServiceKind) => slab(item.floor, item.fixture) + WALL_HEAD + 0.1 + LIFT[kind]
  // Where a pipe or a cable meets a fitting: the middle of a wall or ceiling fitting, tap height on one that stands.
  const meets = (item: Placed) => {
    const spec = fixtureSpec(item.fixture.kind)
    if (spec.mount === 'ceiling') return slab(item.floor, item.fixture) + WALL_HEAD
    if (spec.mount === 'wall') return floorOf(item) + item.fixture.y + fixtureSize(item.fixture).height / 2
    return floorOf(item) + item.fixture.y + TAP_M
  }
  // Which building a point belongs to: the one it is in, or failing that one it stands close against.
  const structures = pad?.structures ?? []
  const buildingOf = (p: { x: number; z: number }): number => {
    const inside = structures.findIndex((structure) => structure.rings.some((ring) => pointInRing(ring, p.x, p.z)))
    if (inside >= 0) return inside
    let best = -1
    let near = BUILDING_REACH_M
    structures.forEach((structure, i) => {
      for (const ring of structure.rings) {
        const d = ringDistance(ring, p.x, p.z)
        if (d < near) {
          near = d
          best = i
        }
      }
    })
    return best
  }
  // A run from one point to another. In one building it goes over the ceiling; from one building to another, or
  // out across the plot, it goes down and along a trench that follows the ground, each kind at its own depth.
  const across = (from: { x: number; z: number }, to: { x: number; z: number }, over: number, kind: ServiceKind): P3[] => {
    const [a, b] = [buildingOf(from), buildingOf(to)]
    if (a >= 0 && a === b) return square(from, to, over)
    const depth = TRENCH_DEPTH_M + LIFT[kind] * 0.5
    const corners = [from, { x: to.x, z: from.z }, to]
    const points: P3[] = []
    for (let i = 0; i < corners.length - 1; i++) {
      const [p, q] = [corners[i], corners[i + 1]]
      const steps = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / TRENCH_STEP_M))
      for (let k = i === 0 ? 0 : 1; k <= steps; k++) {
        const x = p.x + ((q.x - p.x) * k) / steps
        const z = p.z + ((q.z - p.z) * k) / steps
        points.push([x, ground(x, z) - depth, z])
      }
    }
    return points
  }
  const placed: Placed[] = doc.building.floors.flatMap((floor) => (floor.fixtures ?? []).map((fixture) => ({ floor, fixture })))

  const plumbing = plumbingLayout(doc)
  const exit = plumbing.exit
  if (exit) {
    // Wastes fall under the floor to where the drain leaves the house, and the drain runs on to the sewer or tank.
    const out = plumbing.profile?.points[0]?.invert ?? ground(exit.x, exit.z) - 0.45
    for (const drain of plumbing.drains) {
      const from = floorOf(drain.item) - 0.2
      const radius = drain.dia / 2000
      if (drain.item.floor.index === 0 && buildingOf(drain.item.fixture) !== buildingOf(exit)) {
        // From another building: down under its floor and across the plot in a trench to where the drain leaves.
        const trench = across(drain.item.fixture, exit, from, 'drain')
        runs.push({ kind: 'drain', radius, points: [[drain.item.fixture.x, floorOf(drain.item) + 0.3, drain.item.fixture.z], ...trench.slice(0, -1), [exit.x, Math.min(out, trench.at(-1)![1]), exit.z]] })
      } else if (drain.item.floor.index === 0) {
        const [a, b, c] = square(drain.item.fixture, exit, from)
        runs.push({ kind: 'drain', radius, points: [[a[0], floorOf(drain.item) + 0.3, a[2]], a, [b[0], (from + out) / 2, b[2]], [c[0], out, c[2]]] })
      } else {
        // Upstairs, across under the floor to a stack that comes down where the drain leaves.
        runs.push({ kind: 'drain', radius, points: [[drain.item.fixture.x, floorOf(drain.item) + 0.3, drain.item.fixture.z], ...square(drain.item.fixture, exit, from), [exit.x, out, exit.z]] })
      }
    }
    if (plumbing.profile) runs.push({ kind: 'drain', radius: 0.055, points: plumbing.profile.points.map((point) => [point.x, point.invert, point.z]) })

    // Cold water comes in from the meter in a trench, rises where the drain leaves, and runs over the ceilings
    // to drop to each tap. Hot water does the same from the geyser.
    const main = servicePath(doc, 'water', exit, plumbing.water)
    if (main.length > 1) runs.push({ kind: 'cold', radius: 0.02, points: main.map((point) => [point.x, ground(point.x, point.z) - WATER_DEPTH_M, point.z]) })
    const taps = placed.filter((item) => COLD.includes(item.fixture.kind) || GEYSERS.includes(item.fixture.kind))
    for (const item of taps) {
      const over = ceilingOf(item, 'cold')
      runs.push({ kind: 'cold', radius: 0.014, points: [[exit.x, ground(exit.x, exit.z) - WATER_DEPTH_M, exit.z], ...across(exit, item.fixture, over, 'cold'), [item.fixture.x, meets(item), item.fixture.z]] })
    }
    const geysers = placed.filter((item) => GEYSERS.includes(item.fixture.kind))
    for (const item of placed.filter((entry) => HOT.includes(entry.fixture.kind))) {
      const source = geysers.reduce<{ geyser: Placed; run: number } | null>((best, geyser) => {
        const run = Math.abs(geyser.fixture.x - item.fixture.x) + Math.abs(geyser.fixture.z - item.fixture.z) + Math.abs(floorOf(geyser) - floorOf(item))
        return !best || run < best.run ? { geyser, run } : best
      }, null)
      if (!source) continue
      const over = ceilingOf(item, 'hot')
      const from = source.geyser
      runs.push({
        kind: 'hot',
        radius: 0.014,
        points: [[from.fixture.x, floorOf(from) + from.fixture.y, from.fixture.z], ...across(from.fixture, { x: item.fixture.x + 0.06, z: item.fixture.z }, over, 'hot'), [item.fixture.x + 0.06, meets(item), item.fixture.z]],
      })
    }
  }

  // Each circuit leaves the board, goes up into the roof space, and drops to each of its points in turn.
  const wiring = electricalLayout(doc)
  if (wiring.board) {
    for (const circuit of wiring.circuits) {
      const kind: ServiceKind = circuit.kind === 'lights' ? 'lights' : circuit.kind === 'plugs' ? 'plugs' : 'heavy'
      let at: Placed = wiring.board
      const points: P3[] = [[at.fixture.x, meets(at), at.fixture.z]]
      for (const next of circuit.points) {
        const over = ceilingOf(next, kind)
        // Up into the roof space and over, or down and across in a trench to another building.
        points.push(...across(at.fixture, next.fixture, over, kind), [next.fixture.x, meets(next), next.fixture.z])
        at = next
      }
      runs.push({ kind, radius: circuit.cable >= 4 ? 0.016 : 0.01, points })
    }
  }

  // Gas runs along the outside wall from the bottles and through it to the appliance.
  for (const run of gasLayout(doc).runs) {
    const points: P3[] = run.path.map((point) => [point.x, ground(point.x, point.z) + GAS_RUN_Y, point.z])
    const item = run.item
    const last = points.at(-1)
    if (last) points.push([item.fixture.x, last[1], item.fixture.z])
    points.push([item.fixture.x, floorOf(item) + item.fixture.y + 0.3, item.fixture.z])
    if (points.length > 1) runs.push({ kind: 'gas', radius: 0.012, points })
  }
  return runs
}

export function runLength(run: ServiceRun): number {
  let length = 0
  for (let i = 0; i < run.points.length - 1; i++) length += Math.hypot(...run.points[i + 1].map((value, axis) => value - run.points[i][axis]))
  return length
}

export type ServicePart = { kind: ServiceKind; geometry: BufferGeometry; colour: string }

// The runs as tubes, one mesh for each kind of service. Thin runs are drawn a little fatter than life so that
// they can be seen from across the plot.
export function buildServiceParts(runs: ServiceRun[]): ServicePart[] {
  const parts: ServicePart[] = []
  const up = new Vector3(0, 1, 0)
  for (const spec of SERVICE_KINDS) {
    const pieces: BufferGeometry[] = []
    for (const run of runs) {
      if (run.kind !== spec.id) continue
      const radius = Math.max(run.radius, 0.028)
      for (let i = 0; i < run.points.length; i++) {
        const a = new Vector3(...run.points[i])
        pieces.push(new SphereGeometry(radius, 8, 6).translate(a.x, a.y, a.z))
        if (i === run.points.length - 1) break
        const b = new Vector3(...run.points[i + 1])
        const length = a.distanceTo(b)
        if (length < 1e-4) continue
        const turn = new Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize())
        const middle = a.clone().add(b).multiplyScalar(0.5)
        pieces.push(new CylinderGeometry(radius, radius, length, 8, 1, true).applyMatrix4(new Matrix4().compose(middle, turn, new Vector3(1, 1, 1))))
      }
    }
    if (pieces.length === 0) continue
    const merged = mergeGeometries(pieces.map((piece) => (piece.index ? piece.toNonIndexed() : piece)), false)
    for (const piece of pieces) piece.dispose()
    if (merged) parts.push({ kind: spec.id, geometry: merged, colour: spec.colour })
  }
  return parts
}
