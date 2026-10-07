import { BoxGeometry, BufferGeometry, CylinderGeometry, Matrix4, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { cornerById } from '../model/geom'
import { fixtureSize } from '../model/fixtures'
import { supportingFloor } from '../model/stories'
import type { Document, Floor, GutterType, Roof } from '../model/types'
import { fixtureStandAboveDatum } from './fixtures'
import { wallReach } from './outline'
import { masonryReach, roofFacesForFloor, type RoofVertex } from './roof'
import { WALL_HEAD } from '../plot/fixture'
import { SURFACE_BED_TOP_ABOVE_DATUM_M } from './pad'

export const DEFAULT_GUTTER: GutterType = 'round-pvc'
export const DOWNPIPE_EVERY_M = 12

export const GUTTERS: Record<GutterType, { name: string; colour: string; text: string }> = {
  'round-pvc': { name: 'Round plastic', colour: '#e7e5e4', text: 'Half-round PVC gutter with round downpipes. Cheap and light.' },
  'square-metal': { name: 'Square metal', colour: '#3f4448', text: 'Square seamless aluminium gutter with square downpipes. Neater and tougher.' },
}

// A stretch of gutter under one eave, above one wall of the storey below, in the roof's own frame.
export type GutterPiece = { roofFloorId: string; wallId: string | null; a: RoofVertex; b: RoofVertex; out: { x: number; z: number }; on: boolean }

// A rainwater tank a downpipe empties into: stand is how far its pad sits above the ground-floor datum.
export type TankInlet = { id: string; x: number; z: number; height: number; stand: number; radius: number }

export type Downpipe = { roofFloorId: string; x: number; z: number; top: number; tank?: TankInlet }

export type GutterLayout = { pieces: GutterPiece[]; downpipes: Downpipe[] }

// A downpipe this close to a tank's rim is led across into it.
export const TANK_LINK_M = 1.2
// The downpipe stops this far above the tank and turns along to its inlet.
export const INLET_RISE_M = 0.15

// Each downpipe near a rainwater tank on the ground floor empties into the nearest one.
export function linkTanks(doc: Document, downpipes: Downpipe[]): Downpipe[] {
  const ground = doc.building.floors.find((floor) => floor.index === 0)
  const tanks: TankInlet[] = (ground?.fixtures ?? [])
    .filter((fixture) => fixture.kind === 'water-tank')
    .map((fixture) => {
      const size = fixtureSize(fixture)
      return {
        id: fixture.id,
        x: fixture.x,
        z: fixture.z,
        height: fixture.y + size.height,
        stand: fixtureStandAboveDatum(doc, ground!, fixture),
        radius: size.width / 2,
      }
    })
  return downpipes.map((pipe) => {
    const tank = tanks
      .map((item) => ({ item, gap: Math.hypot(item.x - pipe.x, item.z - pipe.z) - item.radius }))
      .filter((entry) => entry.gap < TANK_LINK_M)
      .sort((a, b) => a.gap - b.gap)[0]?.item
    const { tank: _old, ...rest } = pipe
    return tank ? { ...rest, tank } : rest
  })
}

// The leader from the foot of a downpipe across to the middle of its tank's lid.
export function leaderLength(pipe: Downpipe): number {
  return pipe.tank ? Math.hypot(pipe.tank.x - pipe.x, pipe.tank.z - pipe.z) + INLET_RISE_M : 0
}

export function gutterOf(roof: Roof): GutterType {
  return roof.gutter ?? DEFAULT_GUTTER
}

// The level edges the water runs off: on each face, an edge of the roof that lies level with the face falling
// towards it. Most are the lowest edges of the roof. A roof cut back round a deck or a courtyard also sheds water
// from a level edge partway up its slope, and that edge is an eave like any other.
function eaveEdges(faces: RoofVertex[][]): { a: RoofVertex; b: RoofVertex; out: { x: number; z: number } }[] {
  const low = Math.min(...faces.flat().map((v) => v.y))
  const key = (a: RoofVertex, b: RoofVertex) => {
    const [p, q] = [a, b].map((v) => `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`).sort()
    return `${p}|${q}`
  }
  // An edge two faces share is a ridge, a hip or a valley, not the edge of the roof.
  const shared = new Map<string, number>()
  for (const face of faces) for (let i = 0; i < face.length; i++) shared.set(key(face[i], face[(i + 1) % face.length]), (shared.get(key(face[i], face[(i + 1) % face.length])) ?? 0) + 1)
  const edges: { a: RoofVertex; b: RoofVertex; out: { x: number; z: number } }[] = []
  for (const face of faces) {
    // Which way the face falls, from its normal, and which way round it is drawn.
    let [nx, ny, nz, turn] = [0, 0, 0, 0]
    for (let i = 0; i < face.length; i++) {
      const a = face[i]
      const b = face[(i + 1) % face.length]
      nx += (a.y - b.y) * (a.z + b.z)
      ny += (a.z - b.z) * (a.x + b.x)
      nz += (a.x - b.x) * (a.y + b.y)
      turn += a.x * b.z - b.x * a.z
    }
    if (ny < 0) [nx, nz] = [-nx, -nz]
    const fall = Math.hypot(nx, nz)
    for (let i = 0; i < face.length; i++) {
      const a = face[i]
      const b = face[(i + 1) % face.length]
      if (Math.abs(a.y - b.y) > 1e-3) continue
      const length = Math.hypot(b.x - a.x, b.z - a.z)
      if (length < 0.2) continue
      const side = turn > 0 ? 1 : -1
      const out = { x: ((b.z - a.z) / length) * side, z: (-(b.x - a.x) / length) * side }
      const lowest = Math.abs(a.y - low) < 1e-3
      // A flat face has no fall to judge by: its lowest edges are its eaves, as before.
      const downhill = fall > 1e-6 ? (out.x * nx + out.z * nz) / fall > 0.5 : lowest
      if (!downhill || (!lowest && (shared.get(key(a, b)) ?? 0) > 1)) continue
      edges.push({ a, b, out })
    }
  }
  return edges
}

// Split an eave between the walls beneath it, so each wall owns the gutter above it.
function splitByWalls(roof: Roof, below: Floor | undefined, edge: { a: RoofVertex; b: RoofVertex; out: { x: number; z: number } }) {
  const length = Math.hypot(edge.b.x - edge.a.x, edge.b.z - edge.a.z)
  const t = { x: (edge.b.x - edge.a.x) / length, z: (edge.b.z - edge.a.z) / length }
  const spans: { wallId: string; t0: number; t1: number }[] = []
  // Logical walls carry roofs too, so they own the gutter above them like any other wall.
  for (const wall of below?.walls ?? []) {
    const p = cornerById(below!.corners, wall.startCornerId)
    const q = cornerById(below!.corners, wall.endCornerId)
    if (!p || !q) continue
    const wl = Math.hypot(q.x - p.x, q.z - p.z)
    if (wl < 1e-6) continue
    if (Math.abs(((q.x - p.x) * t.z - (q.z - p.z) * t.x) / wl) > 0.02) continue
    const offset = (edge.a.x - p.x) * edge.out.x + (edge.a.z - p.z) * edge.out.z
    if (Math.abs(offset - (wallReach(wall) + roof.eaves)) > 0.25) continue
    const along = (x: number, z: number) => (x - edge.a.x) * t.x + (z - edge.a.z) * t.z
    const s0 = along(p.x, p.z)
    const s1 = along(q.x, q.z)
    spans.push({ wallId: wall.id, t0: Math.min(s0, s1), t1: Math.max(s0, s1) })
  }
  spans.sort((x, y) => x.t0 - y.t0)
  const at = (s: number): RoofVertex => ({ x: edge.a.x + t.x * s, y: edge.a.y, z: edge.a.z + t.z * s })
  if (spans.length === 0) return [{ wallId: null, a: edge.a, b: edge.b }]
  // Each wall takes the eave out to halfway to the next wall; the end walls take the overhangs.
  const cuts = [0, ...spans.slice(0, -1).map((span, i) => (span.t1 + spans[i + 1].t0) / 2), length]
  return spans.map((span, i) => ({ wallId: span.wallId, a: at(Math.max(0, cuts[i])), b: at(Math.min(length, cuts[i + 1])) }))
}

export function gutterLayout(doc: Document): GutterLayout {
  const pieces: GutterPiece[] = []
  const downpipes: GutterLayout['downpipes'] = []
  for (const floor of doc.building.floors) {
    const roof = floor.roof
    if (!roof || floor.index === 0) continue
    const below = supportingFloor(doc, floor)
    const faces = roofFacesForFloor(floor, roof, masonryReach(below?.walls ?? []))
    const off = new Set(roof.noGutter ?? [])
    const found: GutterPiece[] = []
    for (const edge of eaveEdges(faces)) {
      for (const piece of splitByWalls(roof, below, edge)) {
        found.push({ roofFloorId: floor.id, wallId: piece.wallId, a: piece.a, b: piece.b, out: edge.out, on: !piece.wallId || !off.has(piece.wallId) })
      }
    }
    const mine = tidy(found)
    pieces.push(...mine)
    // Downpipes at the ends of each run of gutter, and one more for every 12 m of a long run.
    const spots: { x: number; z: number; top: number }[] = []
    const add = (x: number, z: number, top: number) => {
      if (!spots.some((spot) => Math.hypot(spot.x - x, spot.z - z) < 0.6)) spots.push({ x, z, top })
    }
    for (const run of runs(mine.filter((piece) => piece.on))) {
      const length = run.reduce((sum, piece) => sum + Math.hypot(piece.b.x - piece.a.x, piece.b.z - piece.a.z), 0)
      const first = run[0]
      const last = run[run.length - 1]
      const lift = (p: RoofVertex, out: { x: number; z: number }) => ({ x: p.x + out.x * 0.06, z: p.z + out.z * 0.06 })
      const start = lift(first.a, first.out)
      const end = lift(last.b, last.out)
      add(end.x, end.z, last.b.y)
      if (length > 6) add(start.x, start.z, first.a.y)
      const extra = Math.max(0, Math.ceil(length / DOWNPIPE_EVERY_M) - 2)
      for (let k = 1; k <= extra; k++) {
        const s = (length * k) / (extra + 1)
        let walked = 0
        for (const piece of run) {
          const pl = Math.hypot(piece.b.x - piece.a.x, piece.b.z - piece.a.z)
          if (walked + pl >= s) {
            const f = (s - walked) / pl
            const p = { x: piece.a.x + (piece.b.x - piece.a.x) * f + piece.out.x * 0.06, z: piece.a.z + (piece.b.z - piece.a.z) * f + piece.out.z * 0.06 }
            add(p.x, p.z, piece.a.y)
            break
          }
          walked += pl
        }
      }
    }
    downpipes.push(...spots.map((spot) => ({ roofFloorId: floor.id, ...spot })))
  }
  return { pieces, downpipes: linkTanks(doc, downpipes) }
}

type Lined = { piece: GutterPiece; from: number; to: number }

// The pieces sorted onto the eave lines they lie along, each turned to run the same way along its line.
function eaveLines(pieces: GutterPiece[]): { along: { x: number; z: number }; items: Lined[] }[] {
  const TOUCH = 0.01
  const lines: { out: { x: number; z: number }; along: { x: number; z: number }; offset: number; y: number; items: Lined[] }[] = []
  for (const piece of pieces) {
    const along = { x: -piece.out.z, z: piece.out.x }
    const at = (p: RoofVertex) => p.x * along.x + p.z * along.z
    const turned = at(piece.b) >= at(piece.a) ? piece : { ...piece, a: piece.b, b: piece.a }
    const offset = piece.a.x * piece.out.x + piece.a.z * piece.out.z
    let line = lines.find(
      (item) => Math.abs(item.out.x - piece.out.x) + Math.abs(item.out.z - piece.out.z) < 1e-3 && Math.abs(item.offset - offset) < TOUCH && Math.abs(item.y - piece.a.y) < TOUCH,
    )
    if (!line) {
      line = { out: piece.out, along, offset, y: piece.a.y, items: [] }
      lines.push(line)
    }
    line.items.push({ piece: turned, from: at(turned.a), to: at(turned.b) })
  }
  for (const line of lines) line.items.sort((p, q) => p.from - q.from || q.to - p.to)
  return lines
}

// A roof over several rooms has a face for each, and their eaves can lie over one another along the same line.
// Keep one piece of gutter for each stretch of eave: the first to cover it, cut back where another already does.
function tidy(pieces: GutterPiece[]): GutterPiece[] {
  const MIN = 0.02
  const out: GutterPiece[] = []
  for (const line of eaveLines(pieces)) {
    let reach = -Infinity
    for (const { piece, from, to } of line.items) {
      if (to <= reach + MIN) continue
      const start = Math.max(from, reach)
      const shift = start - from
      const a = shift > 0 ? { x: piece.a.x + line.along.x * shift, y: piece.a.y, z: piece.a.z + line.along.z * shift } : piece.a
      out.push({ ...piece, a })
      reach = to
    }
  }
  return out
}

// Pieces joined end to end along one eave make a run, in order along it.
function runs(pieces: GutterPiece[]): GutterPiece[][] {
  const TOUCH = 0.01
  const out: GutterPiece[][] = []
  for (const line of eaveLines(pieces)) {
    let run: GutterPiece[] = []
    let reach = -Infinity
    for (const item of line.items) {
      if (run.length > 0 && item.from > reach + TOUCH) {
        out.push(run)
        run = []
      }
      run.push(item.piece)
      reach = Math.max(reach, item.to)
    }
    if (run.length > 0) out.push(run)
  }
  return out
}

export type GutterPart = { geometry: BufferGeometry; colour: string }

// Gutters and downpipes in the roof's frame; bottomAt gives the local height a downpipe runs down to, and
// groundDatum the local height of the ground-floor structural datum (outdoor tanks stand on grade above that).
export function buildGutterParts(
  layout: GutterLayout,
  roofFloorId: string,
  type: GutterType,
  bottomAt: (x: number, z: number) => number,
  groundDatum?: number,
): GutterPart[] {
  const round = type === 'round-pvc'
  const parts: BufferGeometry[] = []
  for (const piece of layout.pieces) {
    if (!piece.on || piece.roofFloorId !== roofFloorId) continue
    const length = Math.hypot(piece.b.x - piece.a.x, piece.b.z - piece.a.z)
    if (length < 1e-3) continue
    const geometry = round ? new CylinderGeometry(0.06, 0.06, length, 12).rotateZ(Math.PI / 2) : new BoxGeometry(length, 0.09, 0.11)
    const along = new Vector3((piece.b.x - piece.a.x) / length, 0, (piece.b.z - piece.a.z) / length)
    const side = new Vector3(piece.out.x, 0, piece.out.z)
    const basis = new Matrix4().makeBasis(along, new Vector3(0, 1, 0), side)
    const centre = new Vector3(
      (piece.a.x + piece.b.x) / 2 + piece.out.x * 0.06,
      piece.a.y - 0.06,
      (piece.a.z + piece.b.z) / 2 + piece.out.z * 0.06,
    )
    geometry.applyMatrix4(new Matrix4().makeTranslation(centre.x, centre.y, centre.z).multiply(basis))
    parts.push(geometry.index ? geometry.toNonIndexed() : geometry)
  }
  for (const pipe of layout.downpipes) {
    if (pipe.roofFloorId !== roofFloorId) continue
    const top = pipe.top - 0.1
    const tank = groundDatum !== undefined ? pipe.tank : undefined
    const bottom = tank ? groundDatum! + tank.stand + tank.height + INLET_RISE_M : bottomAt(pipe.x, pipe.z)
    const height = top - bottom
    if (height <= 0.05) continue
    const geometry = round ? new CylinderGeometry(0.04, 0.04, height, 10) : new BoxGeometry(0.065, height, 0.065)
    geometry.translate(pipe.x, bottom + height / 2, pipe.z)
    parts.push(geometry.index ? geometry.toNonIndexed() : geometry)
    if (tank) {
      // Across to the middle of the lid, and down into the inlet.
      const run = Math.hypot(tank.x - pipe.x, tank.z - pipe.z)
      if (run > 0.05) {
        const across = round ? new CylinderGeometry(0.04, 0.04, run, 10).rotateZ(Math.PI / 2) : new BoxGeometry(run, 0.065, 0.065)
        across.rotateY(-Math.atan2(tank.z - pipe.z, tank.x - pipe.x))
        across.translate((pipe.x + tank.x) / 2, bottom, (pipe.z + tank.z) / 2)
        parts.push(across.index ? across.toNonIndexed() : across)
      }
      const drop = round ? new CylinderGeometry(0.04, 0.04, INLET_RISE_M, 10) : new BoxGeometry(0.065, INLET_RISE_M, 0.065)
      drop.translate(tank.x, bottom - INLET_RISE_M / 2, tank.z)
      parts.push(drop.index ? drop.toNonIndexed() : drop)
    }
  }
  if (parts.length === 0) return []
  const merged = mergeGeometries(parts, false)
  for (const part of parts) part.dispose()
  return merged ? [{ geometry: merged, colour: GUTTERS[type].colour }] : []
}

export function gutterLengths(layout: GutterLayout, doc: Document): { gutter: Record<GutterType, number>; downpipe: Record<GutterType, number>; pipes: Record<GutterType, number> } {
  const gutter: Record<GutterType, number> = { 'round-pvc': 0, 'square-metal': 0 }
  const downpipe: Record<GutterType, number> = { 'round-pvc': 0, 'square-metal': 0 }
  const pipes: Record<GutterType, number> = { 'round-pvc': 0, 'square-metal': 0 }
  for (const floor of doc.building.floors) {
    if (!floor.roof) continue
    const type = gutterOf(floor.roof)
    const below = supportingFloor(doc, floor)
    // A downpipe runs from the eave, at the wall head of the storey below, down to the ground.
    const head = (below?.datumHeight ?? 0) + WALL_HEAD + SURFACE_BED_TOP_ABOVE_DATUM_M
    for (const piece of layout.pieces) {
      if (piece.roofFloorId === floor.id && piece.on) gutter[type] += Math.hypot(piece.b.x - piece.a.x, piece.b.z - piece.a.z)
    }
    for (const pipe of layout.downpipes) {
      if (pipe.roofFloorId !== floor.id) continue
      pipes[type] += 1
      // Into a tank, the downpipe stops above it and leads across to its lid.
      const tankTop = pipe.tank ? pipe.tank.stand + pipe.tank.height : 0
      downpipe[type] += head + pipe.top - (pipe.tank ? tankTop + INLET_RISE_M : 0) + leaderLength(pipe)
    }
  }
  return { gutter, downpipe, pipes }
}
