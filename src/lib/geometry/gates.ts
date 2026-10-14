import { cornerById } from '../model/geom'
import { fencePosts, fenceSpec } from '../model/fences'
import { fenceRuns, gateLeaves } from '../model/gates'
import type { Floor, Gate, Wall } from '../model/types'

type Point = { x: number; z: number }

// A fence line as the plan draws it: its lengths between gates with their posts, each swinging gate open square to
// the line with the quarter circle its edge sweeps, and each sliding gate run back beside the fence.
export type FencePlan = {
  wallId: string
  runs: { from: Point; to: Point; posts: Point[] }[]
  swings: { gateId: string; leaf: [Point, Point]; arc: Point[] }[]
  slides: { gateId: string; ring: Point[] }[]
}

// The way a gate opens: as set, or else hung from the line's start and opening toward the middle of the plot.
export function resolvedGate(gate: Gate, inward: 1 | -1): { hinge: 'start' | 'end'; swing: 1 | -1 } {
  return { hinge: gate.hinge ?? 'start', swing: gate.swing ?? inward }
}

// Which side of a line faces a point: the side of its normal (-dz, dx) the point is on.
export function sideToward(floor: Floor, wall: Wall, toward: Point): 1 | -1 {
  const a = cornerById(floor.corners, wall.startCornerId)
  const b = cornerById(floor.corners, wall.endCornerId)
  if (!a || !b) return 1
  const n = { x: -(b.z - a.z), z: b.x - a.x }
  return (toward.x - a.x) * n.x + (toward.z - a.z) * n.z >= 0 ? 1 : -1
}

export function fencePlan(floor: Floor, wall: Wall, plotMiddle: Point): FencePlan | null {
  if (!wall.fence) return null
  const a = cornerById(floor.corners, wall.startCornerId)
  const b = cornerById(floor.corners, wall.endCornerId)
  if (!a || !b) return null
  const length = Math.hypot(b.x - a.x, b.z - a.z)
  if (length < 1e-9) return null
  const t = { x: (b.x - a.x) / length, z: (b.z - a.z) / length }
  const n = { x: -t.z, z: t.x }
  const at = (u: number, out = 0, side: 1 | -1 = 1) => ({ x: a.x + t.x * u + n.x * out * side, z: a.z + t.z * u + n.z * out * side })
  const spec = fenceSpec(wall.fence.type)
  const { runs, gates } = fenceRuns(wall.fence.gates, length)
  const inward = sideToward(floor, wall, plotMiddle)
  const plan: FencePlan = {
    wallId: wall.id,
    runs: runs.filter(([u0, u1]) => u1 - u0 > 1e-3).map(([u0, u1]) => ({ from: at(u0), to: at(u1), posts: fencePosts(u1 - u0, spec).map((u) => at(u0 + u)) })),
    swings: [],
    slides: [],
  }
  for (const gate of gates) {
    const { hinge, swing } = resolvedGate(gate, inward)
    const [u0, u1] = [gate.u, gate.u + gate.width]
    if (gate.opening === 'sliding') {
      // Run back beside the fence, past the end it slides toward, on the side it is hung.
      const [from, to] = hinge === 'start' ? [u0 - gate.width, u0] : [u1, u1 + gate.width]
      plan.slides.push({ gateId: gate.id, ring: [at(from, 0.08, swing), at(to, 0.08, swing), at(to, 0.14, swing), at(from, 0.14, swing)] })
      continue
    }
    const hung: [number, number][] = gateLeaves(gate) === 2 ? [[u0, (u0 + u1) / 2], [u1, (u0 + u1) / 2]] : hinge === 'start' ? [[u0, u1]] : [[u1, u0]]
    for (const [from, to] of hung) {
      const width = Math.abs(to - from)
      const arc: Point[] = []
      for (let i = 0; i <= 16; i++) {
        const angle = (i / 16) * (Math.PI / 2)
        arc.push(at(from + Math.sin(angle) * width * Math.sign(to - from), Math.cos(angle) * width, swing))
      }
      plan.swings.push({ gateId: gate.id, leaf: [at(from), at(from, width, swing)], arc })
    }
  }
  return plan
}
