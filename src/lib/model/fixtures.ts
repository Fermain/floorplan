import { WALL_HEAD } from '../plot/fixture'
import type { Fixture, FixtureKind } from './types'

export type Trade = 'electrical' | 'plumbing'

// wall: hung on a wall face at a height. floor: stands on the floor with its back to a wall. ceiling: overhead, in a room.
export type FixtureMount = 'wall' | 'floor' | 'ceiling'

export type FixtureSpec = {
  id: FixtureKind
  trade: Trade
  name: string
  text: string
  mount: FixtureMount
  outside: boolean
  width: number
  depth: number
  height: number
  y: number
}

const ceilingY = (height: number) => WALL_HEAD - height

export const FIXTURES: readonly FixtureSpec[] = [
  { id: 'socket', trade: 'electrical', name: 'Double socket', text: 'Two socket outlets on one plate, usually 300 mm off the floor.', mount: 'wall', outside: false, width: 0.15, depth: 0.04, height: 0.09, y: 0.3 },
  { id: 'switch', trade: 'electrical', name: 'Light switch', text: 'Beside the door, about 1200 mm up.', mount: 'wall', outside: false, width: 0.09, depth: 0.04, height: 0.09, y: 1.2 },
  { id: 'light', trade: 'electrical', name: 'Ceiling light', text: 'A light point in the ceiling, normally in the middle of the room.', mount: 'ceiling', outside: false, width: 0.3, depth: 0.3, height: 0.08, y: ceilingY(0.08) },
  { id: 'outdoor-light', trade: 'electrical', name: 'Outside light', text: 'A weatherproof wall light by an outside door.', mount: 'wall', outside: true, width: 0.15, depth: 0.12, height: 0.2, y: 2.0 },
  { id: 'stove-isolator', trade: 'electrical', name: 'Stove isolator', text: 'The switch for the stove circuit, beside the stove.', mount: 'wall', outside: false, width: 0.09, depth: 0.04, height: 0.14, y: 1.4 },
  { id: 'extractor', trade: 'electrical', name: 'Extractor fan', text: 'Takes steam out of a bathroom or kitchen, high on an outside wall.', mount: 'wall', outside: false, width: 0.25, depth: 0.1, height: 0.25, y: 2.0 },
  { id: 'db-board', trade: 'electrical', name: 'Distribution board', text: 'The breakers, near the front door where the supply comes in.', mount: 'wall', outside: false, width: 0.45, depth: 0.12, height: 0.5, y: 1.4 },
  { id: 'wc', trade: 'plumbing', name: 'Toilet', text: 'Close-coupled toilet with its cistern against the wall.', mount: 'floor', outside: false, width: 0.38, depth: 0.68, height: 0.78, y: 0 },
  { id: 'basin', trade: 'plumbing', name: 'Wash basin', text: 'Wall-hung basin, rim about 850 mm up.', mount: 'wall', outside: false, width: 0.55, depth: 0.42, height: 0.18, y: 0.67 },
  { id: 'shower', trade: 'plumbing', name: 'Shower', text: 'A 900 mm shower tray with its rose on the wall.', mount: 'floor', outside: false, width: 0.9, depth: 0.9, height: 0.05, y: 0 },
  { id: 'bath', trade: 'plumbing', name: 'Bath', text: 'A 1700 mm bath along a wall.', mount: 'floor', outside: false, width: 1.7, depth: 0.7, height: 0.55, y: 0 },
  { id: 'sink', trade: 'plumbing', name: 'Kitchen sink', text: 'Sink in a 1200 mm base unit, ideally under a window.', mount: 'floor', outside: false, width: 1.2, depth: 0.6, height: 0.9, y: 0 },
  { id: 'washing-machine', trade: 'plumbing', name: 'Washing machine', text: 'Space with a cold tap and a waste for a washing machine.', mount: 'floor', outside: false, width: 0.6, depth: 0.6, height: 0.85, y: 0 },
  { id: 'geyser', trade: 'plumbing', name: 'Geyser', text: 'A 150 litre hot water cylinder in the roof space, best close to the bathroom and kitchen.', mount: 'ceiling', outside: false, width: 1.2, depth: 0.5, height: 0.5, y: WALL_HEAD + 0.05 },
  { id: 'solar-geyser', trade: 'plumbing', name: 'Solar geyser', text: 'A 150 litre geyser heated by a solar collector on the roof, with an element for cloudy days. Meets SANS 10400-XA.', mount: 'ceiling', outside: false, width: 1.2, depth: 0.5, height: 0.5, y: WALL_HEAD + 0.05 },
  { id: 'water-tank', trade: 'plumbing', name: 'Rainwater tank', text: 'A 5,000 litre plastic tank (a JoJo) on a level base against an outside wall, fed from the gutters.', mount: 'floor', outside: true, width: 1.8, depth: 1.8, height: 2.1, y: 0 },
  { id: 'outside-tap', trade: 'plumbing', name: 'Garden tap', text: 'A tap on an outside wall.', mount: 'wall', outside: true, width: 0.08, depth: 0.1, height: 0.08, y: 0.5 },
]

// High enough for a geyser in the roof space over a four-storey building.
export const FIXTURE_MAX_Y_M = 12

export function fixtureSpec(kind: FixtureKind): FixtureSpec {
  return FIXTURES.find((item) => item.id === kind) ?? FIXTURES[0]
}

export function fixtureProblem(fixture: Pick<Fixture, 'kind' | 'x' | 'z' | 'dx' | 'dz' | 'y'>): string | null {
  if (!FIXTURES.some((item) => item.id === fixture.kind)) return 'unknown fixture'
  if (![fixture.x, fixture.z, fixture.dx, fixture.dz, fixture.y].every(Number.isFinite)) return 'fixture position is not a number'
  if (Math.abs(Math.hypot(fixture.dx, fixture.dz) - 1) > 1e-6) return 'fixture needs a facing direction'
  if (fixture.y < -1e-9 || fixture.y > FIXTURE_MAX_Y_M) return 'fixture height out of range'
  return null
}

// The four corners of the fixture's footprint, back edge first.
export function fixtureFootprint(fixture: Pick<Fixture, 'kind' | 'x' | 'z' | 'dx' | 'dz'>): { x: number; z: number }[] {
  const spec = fixtureSpec(fixture.kind)
  const side = { x: -fixture.dz, z: fixture.dx }
  const at = (along: number, across: number) => ({
    x: fixture.x + side.x * along + fixture.dx * across,
    z: fixture.z + side.z * along + fixture.dz * across,
  })
  const w = spec.width / 2
  const d = spec.depth / 2
  return [at(-w, -d), at(w, -d), at(w, d), at(-w, d)]
}
