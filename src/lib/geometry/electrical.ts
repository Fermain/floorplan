import { DB_HIGHEST_M, DB_LOWEST_M, DB_WATER_CLEAR_M, fixtureFootprint, fixtureSpec } from '../model/fixtures'
import { roomKey } from '../model/rooms'
import type { Document, Fixture, FixtureKind, Floor } from '../model/types'
import { WALL_HEAD } from '../plot/fixture'
import { finishedFloor } from './fixtures'
import { pointInRing } from './pad'
import { cellAt, floorCells, layoutSpaces } from './spaces'

// Rules of thumb for an indicative layout, not a SANS 10142-1 design. A registered electrician sizes the real thing.
export const MAX_LIGHT_POINTS = 10
export const MAX_SOCKETS = 8
export const BATHROOM_ZONE_M = 0.6
export const CABLE_WASTE = 1.1
const BOARD_SIZES = [8, 12, 16, 24, 36]

export type CircuitKind = 'lights' | 'plugs' | 'stove' | 'geyser'

export type Placed = { floor: Floor; fixture: Fixture }

export type Circuit = {
  id: string
  kind: CircuitKind
  name: string
  breaker: number
  cable: number
  points: Placed[]
  // The run in plan, board first, for drawing.
  path: { floorId: string; x: number; z: number }[]
  length: number
  drops: number
}

export type ElectricalLayout = {
  board: Placed | null
  circuits: Circuit[]
  ways: number
  boardSize: number | null
  boxes: number
}

const LIGHT_KINDS: FixtureKind[] = ['light', 'outdoor-light', 'extractor']
// Fittings with a tap or valve.
const WATER: FixtureKind[] = ['wc', 'basin', 'sink', 'shower', 'bath', 'washing-machine']

const CIRCUIT_INFO: Record<CircuitKind, { prefix: string; label: string; breaker: number; cable: number }> = {
  lights: { prefix: 'L', label: 'Lights', breaker: 10, cable: 1.5 },
  plugs: { prefix: 'P', label: 'Plugs', breaker: 20, cable: 2.5 },
  stove: { prefix: 'S', label: 'Stove', breaker: 32, cable: 6 },
  geyser: { prefix: 'G', label: 'Geyser', breaker: 20, cable: 2.5 },
}

// Height of the ceiling void a run goes through, and of the point where the cable meets a fitting, both from the floor datum.
function ceiling(floor: Floor): number {
  return floor.datumHeight + WALL_HEAD
}

// Where the cable meets a fitting: the top of a wall box, the ceiling for a light, or above it for a geyser in the roof.
function entry(item: Placed): number {
  const spec = fixtureSpec(item.fixture.kind)
  const top = item.floor.datumHeight + finishedFloor(item.floor) + item.fixture.y + spec.height
  return spec.mount === 'ceiling' ? Math.max(top, ceiling(item.floor)) : Math.min(top, ceiling(item.floor))
}

// Up to the ceiling, across it square to the walls, and down to the next point.
export function runBetween(a: Placed, b: Placed): { length: number; drops: number } {
  const across = Math.abs(a.fixture.x - b.fixture.x) + Math.abs(a.fixture.z - b.fixture.z)
  const between = Math.abs(ceiling(a.floor) - ceiling(b.floor))
  const up = Math.abs(ceiling(a.floor) - entry(a))
  const down = Math.abs(ceiling(b.floor) - entry(b))
  const chased = Math.max(0, ceiling(b.floor) - entry(b))
  return { length: up + across + between + down, drops: chased }
}

function chain(board: Placed, points: Placed[]): { order: Placed[]; length: number; drops: number } {
  const left = [...points]
  const order: Placed[] = []
  let at = board
  let length = 0
  let drops = Math.abs(ceiling(board.floor) - entry(board))
  while (left.length > 0) {
    let best = 0
    let bestRun = runBetween(at, left[0])
    for (let i = 1; i < left.length; i++) {
      const run = runBetween(at, left[i])
      if (run.length < bestRun.length) {
        best = i
        bestRun = run
      }
    }
    const next = left.splice(best, 1)[0]
    length += bestRun.length
    drops += bestRun.drops
    order.push(next)
    at = next
  }
  return { order, length, drops }
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function nearestFirst(board: Placed, items: Placed[]): Placed[] {
  return [...items].sort((a, b) => runBetween(board, a).length - runBetween(board, b).length)
}

// Switch legs: from each switch to the nearest light in the same room, up its wall and across the ceiling.
function switchLegs(switches: Placed[], lights: Placed[]): { length: number; drops: number } {
  let length = 0
  let drops = 0
  for (const item of switches) {
    const near = lights
      .filter((light) => light.floor.id === item.floor.id)
      .reduce<{ light: Placed; run: number } | null>((best, light) => {
        const run = runBetween(light, item).length
        return !best || run < best.run ? { light, run } : best
      }, null)
    if (!near) continue
    const run = runBetween(near.light, item)
    length += run.length
    drops += run.drops
  }
  return { length, drops }
}

export function electricalLayout(doc: Document): ElectricalLayout {
  const placed: Placed[] = doc.building.floors.flatMap((floor) => (floor.fixtures ?? []).map((fixture) => ({ floor, fixture })))
  const board = placed.find((item) => item.fixture.kind === 'db-board') ?? null
  const electrical = placed.filter((item) => fixtureSpec(item.fixture.kind).trade === 'electrical' && item.fixture.kind !== 'db-board')
  const boxes = electrical.filter((item) => fixtureSpec(item.fixture.kind).mount === 'wall').length
  if (!board) return { board: null, circuits: [], ways: 0, boardSize: null, boxes }

  const circuits: Circuit[] = []
  const count: Record<CircuitKind, number> = { lights: 0, plugs: 0, stove: 0, geyser: 0 }
  const add = (kind: CircuitKind, points: Placed[], extra = { length: 0, drops: 0 }) => {
    const info = CIRCUIT_INFO[kind]
    count[kind] += 1
    const run = chain(board, points)
    circuits.push({
      id: `${info.prefix}${count[kind]}`,
      kind,
      name: `${info.label} ${count[kind]}`,
      breaker: info.breaker,
      cable: info.cable,
      points: run.order,
      path: [board, ...run.order].map((item) => ({ floorId: item.floor.id, x: item.fixture.x, z: item.fixture.z })),
      length: run.length + extra.length,
      drops: run.drops + extra.drops,
    })
  }

  const storeys = [...new Set(placed.map((item) => item.floor.index))].sort((a, b) => a - b)
  for (const index of storeys) {
    const here = (kinds: FixtureKind[]) => electrical.filter((item) => item.floor.index === index && kinds.includes(item.fixture.kind))
    const lights = here(LIGHT_KINDS)
    const switches = here(['switch'])
    const lightGroups = chunks(nearestFirst(board, lights), MAX_LIGHT_POINTS)
    lightGroups.forEach((group, i) => add('lights', group, i === 0 ? switchLegs(switches, lights) : undefined))
    for (const group of chunks(nearestFirst(board, here(['socket'])), MAX_SOCKETS)) add('plugs', group)
  }
  for (const item of electrical.filter((entry) => entry.fixture.kind === 'stove-isolator')) add('stove', [item])
  for (const item of placed.filter((entry) => entry.fixture.kind === 'geyser' || entry.fixture.kind === 'solar-geyser')) add('geyser', [item])

  // Each circuit takes one way; the main switch and the earth leakage unit take two each.
  const ways = circuits.length + 4
  const boardSize = BOARD_SIZES.find((size) => size >= Math.ceil(ways * 1.2)) ?? null
  return { board, circuits, ways, boardSize, boxes }
}

export type ElectricalIssue = { id: string; text: string; floorId?: string; fixtureId?: string }

function distanceToRing(ring: { x: number; z: number }[], x: number, z: number): number {
  if (pointInRing(ring, x, z)) return 0
  let best = Infinity
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)))
    best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)))
  }
  return best
}

export function electricalIssues(doc: Document): ElectricalIssue[] {
  const issues: ElectricalIssue[] = []
  const layout = electricalLayout(doc)
  const electrical = doc.building.floors.flatMap((floor) =>
    (floor.fixtures ?? []).filter((fixture) => fixtureSpec(fixture.kind).trade === 'electrical').map((fixture) => ({ floor, fixture })),
  )
  if (electrical.length > 0 && !layout.board) {
    issues.push({ id: 'no-board', text: 'Add a distribution board; every circuit starts there.' })
  }
  for (const floor of doc.building.floors) {
    // Where the distribution board may go: SANS 10142-1.
    const cells = floorCells(floor)
    const spaces = layoutSpaces(floor).spaces
    const roomOf = (x: number, z: number) => cellAt(cells, x, z)
    for (const board of (floor.fixtures ?? []).filter((fixture) => fixture.kind === 'db-board')) {
      const spec = fixtureSpec('db-board')
      const at = { floorId: floor.id, fixtureId: board.id }
      if (board.y < DB_LOWEST_M - 1e-6) {
        issues.push({ id: `db-low:${board.id}`, text: `The distribution board starts ${Math.round(board.y * 1000)} mm up; SANS 10142-1 wants no part of it below ${DB_LOWEST_M * 1000} mm, out of a child's reach.`, ...at })
      }
      if (board.y + spec.height > DB_HIGHEST_M + 1e-6) {
        issues.push({ id: `db-high:${board.id}`, text: `The top of the distribution board is ${Math.round((board.y + spec.height) * 1000)} mm up; its switches must be no higher than ${DB_HIGHEST_M * 1000} mm.`, ...at })
      }
      const room = roomOf(board.x, board.z)
      const named = room ? spaces.find((space) => space.cells.some((cell) => roomKey(cell.room.cornerIds) === roomKey(room.room.cornerIds))) : undefined
      if (named && (named.space.type === 'bathroom' || named.space.type === 'toilet')) {
        issues.push({ id: `db-bathroom:${board.id}`, text: `The distribution board is in ${named.space.name}; it may not go in a bathroom.`, ...at })
      }
      const sameRoom = (fixture: Fixture) => room !== undefined && roomOf(fixture.x, fixture.z)?.room === room.room
      const water = (floor.fixtures ?? []).find(
        (fixture) => WATER.includes(fixture.kind) && sameRoom(fixture) && Math.hypot(fixture.x - board.x, fixture.z - board.z) < DB_WATER_CLEAR_M,
      )
      if (water) {
        issues.push({ id: `db-water:${board.id}`, text: `The distribution board is within ${DB_WATER_CLEAR_M} m of the ${fixtureSpec(water.kind).name.toLowerCase()}'s tap; keep it a metre from water, or use a weatherproof board.`, ...at })
      }
      const stove = (floor.fixtures ?? []).find(
        (fixture) => fixture.kind === 'stove-isolator' && sameRoom(fixture) && Math.hypot(fixture.x - board.x, fixture.z - board.z) < DB_WATER_CLEAR_M,
      )
      if (stove) {
        issues.push({ id: `db-stove:${board.id}`, text: 'The distribution board is next to the stove isolator; it may not go above the stove, or where a stove could stand under it.', ...at })
      }
    }
    const wet = (floor.fixtures ?? []).filter((fixture) => fixture.kind === 'bath' || fixture.kind === 'shower')
    for (const fixture of floor.fixtures ?? []) {
      if (fixture.kind === 'socket') {
        const near = wet.find((item) => distanceToRing(fixtureFootprint(item), fixture.x, fixture.z) < BATHROOM_ZONE_M)
        if (near) {
          issues.push({
            id: `zone:${fixture.id}`,
            text: `A socket is within ${Math.round(BATHROOM_ZONE_M * 1000)} mm of the ${fixtureSpec(near.kind).name.toLowerCase()}. Keep sockets out of the bathroom zones.`,
            floorId: floor.id,
            fixtureId: fixture.id,
          })
        }
      }
      if (fixture.kind === 'switch') {
        const inside = spaces.find(
          (space) =>
            (space.space.type === 'bathroom' || space.space.type === 'toilet') &&
            space.cells.some((cell) => pointInRing(cell.net, fixture.x, fixture.z)),
        )
        if (inside) {
          issues.push({
            id: `bath-switch:${fixture.id}`,
            text: `The light switch in ${inside.space.name} is inside the room. Put it outside the door, or use a pull cord.`,
            floorId: floor.id,
            fixtureId: fixture.id,
          })
        }
      }
    }
  }
  return issues
}
