import { WALL_HEAD } from '../plot/fixture'
import type { BottleSize, Fixture, FixtureKind, TankLitres } from './types'

export type Trade = 'electrical' | 'plumbing' | 'gas'

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
  { id: 'water-tank', trade: 'plumbing', name: 'Rainwater tank', text: 'A plastic tank (a JoJo) on a square concrete pad against an outside wall, fed by a downpipe from the gutters. Set it by a downpipe and it connects.', mount: 'floor', outside: true, width: 1.8, depth: 1.8, height: 2.25, y: 0 },
  { id: 'stove', trade: 'electrical', name: 'Electric stove', text: 'A 600 mm freestanding stove with an oven, on its own 32 A circuit through a stove isolator.', mount: 'floor', outside: false, width: 0.6, depth: 0.6, height: 0.9, y: 0 },
  { id: 'gas-stove', trade: 'gas', name: 'Gas stove', text: 'A 600 mm freestanding gas stove, fed by copper pipe from the gas bottles outside. Needs no stove circuit.', mount: 'floor', outside: false, width: 0.6, depth: 0.6, height: 0.9, y: 0 },
  { id: 'gas-geyser', trade: 'gas', name: 'Gas geyser', text: 'A 16 litre a minute instantaneous gas water heater on an outside wall. Hydrostatic: the water pressure lights it, so it needs no electrical point.', mount: 'wall', outside: true, width: 0.35, depth: 0.2, height: 0.6, y: 1.2 },
  { id: 'gas-cylinder', trade: 'gas', name: 'Gas bottles', text: 'One to four LP gas bottles on a regulator and manifold, on a level slab against an outside wall, locked in a steel cage.', mount: 'floor', outside: true, width: 0.9, depth: 0.475, height: 1.4, y: 0 },
  { id: 'outside-tap', trade: 'plumbing', name: 'Garden tap', text: 'A tap on an outside wall.', mount: 'wall', outside: true, width: 0.08, depth: 0.1, height: 0.08, y: 0.5 },
]

// High enough for a geyser in the roof space over a four-storey building.
export const FIXTURE_MAX_Y_M = 12

// SANS 10142-1: no part of an indoor distribution board lower than 1.2 m, and nothing you operate higher than 2.2 m.
export const DB_LOWEST_M = 1.2
export const DB_HIGHEST_M = 2.2
// Nor in a bathroom, above a stove, or within 1 m of a tap or valve in the same room.
export const DB_WATER_CLEAR_M = 1

// SANS 10142-1: a cooking appliance's switch-disconnector within 3 m of it, between 0.5 m and 2.2 m up.
export const ISOLATOR_REACH_M = 3
export const ISOLATOR_LOWEST_M = 0.5
export const ISOLATOR_HIGHEST_M = 2.2

// The heights the wiring code allows a fitting, from its underside to its top.
export const HEIGHT_BANDS: Partial<Record<FixtureKind, [number, number]>> = {
  'db-board': [DB_LOWEST_M, DB_HIGHEST_M],
  'stove-isolator': [ISOLATOR_LOWEST_M, ISOLATOR_HIGHEST_M],
}

// A fitting's height kept inside any band the wiring code sets for it.
export function fitFixtureY(kind: FixtureKind, y: number): number {
  const band = HEIGHT_BANDS[kind]
  if (!band) return Math.max(0, y)
  const height = fixtureSpec(kind).height
  return Math.min(band[1] - height, Math.max(band[0], y))
}

// Fittings that stand in the same spot and can be swapped one for another, such as an electric stove for a gas one.
export const SWAPS: FixtureKind[][] = [
  ['stove', 'gas-stove'],
  ['geyser', 'solar-geyser'],
]

export function swapsFor(kind: FixtureKind): FixtureKind[] {
  return SWAPS.find((group) => group.includes(kind)) ?? []
}

// Fittings that may stand against a wall inside a room as well as outside: a single small gas bottle can.
export const EITHER_SIDE: FixtureKind[] = ['gas-cylinder']

// LP gas bottles as sold in South Africa: diameter and height, roughly.
export const BOTTLES: Record<BottleSize, { name: string; dia: number; height: number }> = {
  9: { name: '9 kg', dia: 0.3, height: 0.5 },
  19: { name: '19 kg', dia: 0.32, height: 0.75 },
  48: { name: '48 kg', dia: 0.375, height: 1.3 },
}
export const BOTTLE_SIZES: BottleSize[] = [9, 19, 48]
export const MAX_BOTTLES = 4
export const DEFAULT_BOTTLES = 2
export const DEFAULT_BOTTLE_KG: BottleSize = 48
export const BOTTLE_GAP_M = 0.05
export const CAGE_M = 0.05

export function bottleSetup(fixture: Pick<Fixture, 'bottles' | 'bottleKg' | 'cage'>): { count: number; kg: BottleSize; cage: boolean } {
  return { count: fixture.bottles ?? DEFAULT_BOTTLES, kg: fixture.bottleKg ?? DEFAULT_BOTTLE_KG, cage: fixture.cage ?? true }
}

// Bottles indoors: a single 9 kg bottle, with no cage, re-seated so its back stays against the wall.
export function indoorBottles<T extends Omit<Fixture, 'id'>>(fixture: T): T {
  return reseat(fixture, { bottles: 1, bottleKg: 9, cage: false })
}

// Change gas bottles' count, size or cage, keeping the back of the row where it was.
export function reseat<T extends Omit<Fixture, 'id'>>(fixture: T, patch: Partial<Pick<Fixture, 'bottles' | 'bottleKg' | 'cage' | 'litres'>>): T {
  const next = { ...fixture, ...patch }
  const shift = (fixtureSize(next).depth - fixtureSize(fixture).depth) / 2
  return { ...next, x: fixture.x + fixture.dx * shift, z: fixture.z + fixture.dz * shift }
}

// Upright plastic rainwater tanks, roughly as sold: diameter and height.
export const TANKS: Record<TankLitres, { name: string; dia: number; height: number }> = {
  1000: { name: '1,000 L', dia: 1.1, height: 1.35 },
  2500: { name: '2,500 L', dia: 1.45, height: 1.9 },
  5000: { name: '5,000 L', dia: 1.8, height: 2.25 },
  10000: { name: '10,000 L', dia: 2.4, height: 2.6 },
}
export const TANK_SIZES: TankLitres[] = [1000, 2500, 5000, 10000]
export const DEFAULT_TANK_LITRES: TankLitres = 5000

export function tankLitres(fixture: Pick<Fixture, 'litres'>): TankLitres {
  return fixture.litres ?? DEFAULT_TANK_LITRES
}

// A fitting's size; most are fixed, but gas bottles grow with how many there are, how big, and their cage.
export function fixtureSize(fixture: Pick<Fixture, 'kind' | 'bottles' | 'bottleKg' | 'cage' | 'litres'>): { width: number; depth: number; height: number } {
  const spec = fixtureSpec(fixture.kind)
  if (fixture.kind === 'water-tank') {
    const tank = TANKS[tankLitres(fixture)]
    return { width: tank.dia, depth: tank.dia, height: tank.height }
  }
  if (fixture.kind !== 'gas-cylinder') return { width: spec.width, depth: spec.depth, height: spec.height }
  const { count, kg, cage } = bottleSetup(fixture)
  const bottle = BOTTLES[kg]
  const wrap = cage ? CAGE_M * 2 : 0
  return { width: count * bottle.dia + (count - 1) * BOTTLE_GAP_M + wrap, depth: bottle.dia + wrap, height: bottle.height + (cage ? CAGE_M * 2 : 0) }
}

export function fixtureSpec(kind: FixtureKind): FixtureSpec {
  return FIXTURES.find((item) => item.id === kind) ?? FIXTURES[0]
}

export function fixtureProblem(fixture: Pick<Fixture, 'kind' | 'x' | 'z' | 'dx' | 'dz' | 'y' | 'bottles' | 'bottleKg' | 'cage' | 'litres'>): string | null {
  if (!FIXTURES.some((item) => item.id === fixture.kind)) return 'unknown fixture'
  if (![fixture.x, fixture.z, fixture.dx, fixture.dz, fixture.y].every(Number.isFinite)) return 'fixture position is not a number'
  if (Math.abs(Math.hypot(fixture.dx, fixture.dz) - 1) > 1e-6) return 'fixture needs a facing direction'
  if (fixture.y < -1e-9 || fixture.y > FIXTURE_MAX_Y_M) return 'fixture height out of range'
  const { bottles, bottleKg, cage } = fixture
  if (bottles !== undefined && (!Number.isInteger(bottles) || bottles < 1 || bottles > MAX_BOTTLES)) return `one to ${MAX_BOTTLES} gas bottles`
  if (bottleKg !== undefined && !BOTTLE_SIZES.includes(bottleKg)) return 'unknown gas bottle size'
  if (cage !== undefined && typeof cage !== 'boolean') return 'cage is yes or no'
  if (fixture.litres !== undefined && !TANK_SIZES.includes(fixture.litres)) return 'unknown tank size'
  return null
}

// The four corners of the fixture's footprint, back edge first.
export function fixtureFootprint(fixture: Pick<Fixture, 'kind' | 'x' | 'z' | 'dx' | 'dz' | 'bottles' | 'bottleKg' | 'cage' | 'litres'>): { x: number; z: number }[] {
  const spec = fixtureSize(fixture)
  const side = { x: -fixture.dz, z: fixture.dx }
  const at = (along: number, across: number) => ({
    x: fixture.x + side.x * along + fixture.dx * across,
    z: fixture.z + side.z * along + fixture.dz * across,
  })
  const w = spec.width / 2
  const d = spec.depth / 2
  return [at(-w, -d), at(w, -d), at(w, d), at(-w, d)]
}
