import type { Document, Floor } from '../model/types'
import { supportingFloor } from '../model/stories'
import { electricalLayout, type Circuit } from './electrical'
import { masonryReach, roofFacesForFloor, type RoofVertex } from './roof'
import { coveringOf } from './coverings'

// Indicative loads for sizing load-shedding backup; a solar installer sizes the real system.
export const LIGHT_W = 10
export const EXTRACTOR_W = 30
export const PLUG_RUNNING_W = 150
export const SOCKET_RUNNING_W = 25
export const PLUG_PEAK_W = 1500
export const HEAVY_PEAK_W: Record<'stove' | 'geyser', number> = { stove: 6000, geyser: 3000 }
export const DEFAULT_BACKUP_HOURS = 4
export const BATTERY_MODULE_KWH = 5.12
export const BATTERY_DEPTH = 0.9
export const INVERTER_SIZES = [3, 5, 8, 10, 15]

export const PANEL_LONG_M = 2.28
export const PANEL_SHORT_M = 1.13
export const PANEL_W = 550
// Rough yield in South Africa's sunnier regions: kWh a year for each kWp facing north.
export const YIELD_KWH_PER_KWP = 1600
const EDGE_M = 0.3
const GAP_M = 0.02

export type PanelSpot = { corners: RoofVertex[]; floorId: string }

export type RoofFace = { floorId: string; vertices: RoofVertex[]; area: number; facing: number; spots: PanelSpot[] }

export type PowerLayout = {
  essential: Circuit[]
  running: number
  peak: number
  hours: number
  inverterKva: number | null
  batteryKwh: number
  batteryModules: number
  warnings: { id: string; text: string }[]
  faces: RoofFace[]
  capacity: number
  panels: number
  panelSpots: PanelSpot[]
  kwp: number
  yearly: number
  dailyNeed: number
}

function circuitLoad(circuit: Circuit): { running: number; peak: number } {
  if (circuit.kind === 'lights') {
    const watts = circuit.points.reduce((sum, point) => sum + (point.fixture.kind === 'extractor' ? EXTRACTOR_W : LIGHT_W), 0)
    return { running: watts, peak: watts }
  }
  if (circuit.kind === 'plugs') {
    return { running: PLUG_RUNNING_W + SOCKET_RUNNING_W * circuit.points.length, peak: PLUG_PEAK_W + SOCKET_RUNNING_W * circuit.points.length }
  }
  return { running: HEAVY_PEAK_W[circuit.kind] * 0.3, peak: HEAVY_PEAK_W[circuit.kind] }
}

function sub(a: RoofVertex, b: RoofVertex) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

function cross(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }
}

function norm(a: { x: number; y: number; z: number }) {
  const l = Math.hypot(a.x, a.y, a.z) || 1
  return { x: a.x / l, y: a.y / l, z: a.z / l }
}

function pointInPolygon(poly: { u: number; v: number }[], u: number, v: number): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.v > v !== b.v > v && u < ((b.u - a.u) * (v - a.v)) / (b.v - a.v || 1e-12) + a.u) inside = !inside
  }
  return inside
}

function distanceToEdges(poly: { u: number; v: number }[], u: number, v: number): number {
  let best = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const du = b.u - a.u
    const dv = b.v - a.v
    const t = Math.max(0, Math.min(1, ((u - a.u) * du + (v - a.v) * dv) / (du * du + dv * dv || 1)))
    best = Math.min(best, Math.hypot(u - (a.u + du * t), v - (a.v + dv * t)))
  }
  return best
}

// How well a slope faces the sun, from 1 facing north to about 0.6 facing south.
export function facingFactor(downslope: { x: number; z: number }, northBearingDeg: number): number {
  const b = (northBearingDeg * Math.PI) / 180
  const north = { x: -Math.sin(b), z: Math.cos(b) }
  const length = Math.hypot(downslope.x, downslope.z)
  if (length < 1e-6) return 0.9
  const cos = (downslope.x * north.x + downslope.z * north.z) / length
  return 0.8 + 0.2 * cos
}

// Panels in landscape rows across a roof face, kept clear of its edges.
function layFace(vertices: RoofVertex[], floorId: string, coverDepth: number): PanelSpot[] {
  if (vertices.length < 3) return []
  const normal = norm(cross(sub(vertices[1], vertices[0]), sub(vertices[2], vertices[0])))
  const up = normal.y < 0 ? { x: -normal.x, y: -normal.y, z: -normal.z } : normal
  if (up.y < 0.2) return []
  // Along the slope's contour (u) and up the slope (v), both on the face.
  let along = norm(cross({ x: 0, y: 1, z: 0 }, up))
  if (Math.hypot(along.x, along.z) < 1e-6) along = { x: 1, y: 0, z: 0 }
  const upSlope = norm(cross(up, along))
  const origin = vertices[0]
  const project = (p: RoofVertex) => {
    const d = sub(p, origin)
    return { u: d.x * along.x + d.y * along.y + d.z * along.z, v: d.x * upSlope.x + d.y * upSlope.y + d.z * upSlope.z }
  }
  const poly = vertices.map(project)
  const us = poly.map((p) => p.u)
  const vs = poly.map((p) => p.v)
  const spots: PanelSpot[] = []
  // The tiles sit above the face by their depth, measured straight up; panels stand a little clear of them.
  const lift = 0.06
  const raise = coverDepth / Math.max(up.y, 0.05)
  const place = (u: number, v: number): RoofVertex => ({
    x: origin.x + along.x * u + upSlope.x * v + up.x * lift,
    y: origin.y + along.y * u + upSlope.y * v + up.y * lift + raise,
    z: origin.z + along.z * u + upSlope.z * v + up.z * lift,
  })
  for (let v = Math.min(...vs) + EDGE_M; v + PANEL_SHORT_M <= Math.max(...vs) - EDGE_M; v += PANEL_SHORT_M + GAP_M) {
    for (let u = Math.min(...us) + EDGE_M; u + PANEL_LONG_M <= Math.max(...us) - EDGE_M; u += PANEL_LONG_M + GAP_M) {
      const corners = [
        { u, v },
        { u: u + PANEL_LONG_M, v },
        { u: u + PANEL_LONG_M, v: v + PANEL_SHORT_M },
        { u, v: v + PANEL_SHORT_M },
      ]
      if (corners.every((c) => pointInPolygon(poly, c.u, c.v) && distanceToEdges(poly, c.u, c.v) >= EDGE_M)) {
        spots.push({ corners: corners.map((c) => place(c.u, c.v)), floorId })
      }
    }
  }
  return spots
}

function faceArea(vertices: RoofVertex[]): number {
  let sum = { x: 0, y: 0, z: 0 }
  for (let i = 1; i < vertices.length - 1; i++) {
    const c = cross(sub(vertices[i], vertices[0]), sub(vertices[i + 1], vertices[0]))
    sum = { x: sum.x + c.x, y: sum.y + c.y, z: sum.z + c.z }
  }
  return Math.hypot(sum.x, sum.y, sum.z) / 2
}

export function roofFaces(doc: Document): RoofFace[] {
  const faces: RoofFace[] = []
  for (const floor of doc.building.floors as Floor[]) {
    if (!floor.roof || floor.index === 0) continue
    const below = supportingFloor(doc, floor)
    for (const vertices of roofFacesForFloor(floor, floor.roof, masonryReach(below?.walls ?? []))) {
      const normal = norm(cross(sub(vertices[1], vertices[0]), sub(vertices[2], vertices[0])))
      const up = normal.y < 0 ? { x: -normal.x, z: -normal.z } : { x: normal.x, z: normal.z }
      faces.push({
        floorId: floor.id,
        vertices,
        area: faceArea(vertices),
        facing: facingFactor(up, doc.plot.northBearingDeg),
        spots: layFace(vertices, floor.id, coveringOf(floor.roof).depth),
      })
    }
  }
  return faces.sort((a, b) => b.facing - a.facing)
}

export function powerLayout(doc: Document): PowerLayout {
  const wiring = electricalLayout(doc)
  const chosen = new Set(doc.services?.essential ?? [])
  const essential = wiring.circuits.filter((circuit) => chosen.has(circuit.id))
  const loads = essential.map(circuitLoad)
  const running = loads.reduce((sum, load) => sum + load.running, 0)
  const peak = loads.reduce((sum, load) => sum + load.peak, 0)
  const hours = doc.services?.backupHours ?? DEFAULT_BACKUP_HOURS
  const warnings: PowerLayout['warnings'] = []
  for (const circuit of essential) {
    if (circuit.kind === 'stove' || circuit.kind === 'geyser') {
      warnings.push({
        id: `heavy:${circuit.id}`,
        text: `${circuit.name} draws about ${HEAVY_PEAK_W[circuit.kind] / 1000} kW; backing it up needs a much bigger inverter and battery. Gas for cooking, or a solar geyser, usually costs less.`,
      })
    }
  }
  const inverterKva = essential.length === 0 ? null : (INVERTER_SIZES.find((size) => size * 1000 * 0.8 >= peak * 1.25) ?? null)
  if (essential.length > 0 && inverterKva === null) {
    warnings.push({ id: 'inverter-too-big', text: 'The essential load is more than a 15 kVA home inverter carries. Mark fewer circuits as essential.' })
  }
  const batteryKwh = (running * hours) / 1000 / BATTERY_DEPTH
  const batteryModules = essential.length === 0 ? 0 : Math.max(1, Math.ceil(batteryKwh / BATTERY_MODULE_KWH))

  const faces = roofFaces(doc)
  const usable = faces.filter((face) => face.facing >= 0.75)
  const capacity = usable.reduce((sum, face) => sum + face.spots.length, 0)
  const requested = doc.services?.solarPanels ?? 0
  const panels = Math.max(0, Math.min(requested, capacity))
  const panelSpots: PanelSpot[] = []
  let yearly = 0
  let left = panels
  for (const face of usable) {
    const take = face.spots.slice(0, left)
    panelSpots.push(...take)
    yearly += (take.length * PANEL_W) / 1000 * YIELD_KWH_PER_KWP * face.facing
    left -= take.length
    if (left <= 0) break
  }
  // A day's charge for the battery, plus running the essentials through daylight.
  const dailyNeed = batteryModules * BATTERY_MODULE_KWH + (running * 8) / 1000
  return {
    essential,
    running,
    peak,
    hours,
    inverterKva,
    batteryKwh,
    batteryModules,
    warnings,
    faces,
    capacity,
    panels,
    panelSpots,
    kwp: (panels * PANEL_W) / 1000,
    yearly,
    dailyNeed,
  }
}

// Panels that would refill the battery and run the essentials on an average day.
export function suggestedPanels(layout: Pick<PowerLayout, 'dailyNeed' | 'capacity'>): number {
  const perPanelDaily = ((PANEL_W / 1000) * YIELD_KWH_PER_KWP) / 365
  return Math.min(layout.capacity, Math.ceil(layout.dailyNeed / perPanelDaily))
}
