import { deckPolygons, deckThickness, surfaceBedPolygons, type DeckPolygon } from '../geometry/deck'
import { groundPad, SURFACE_BED_THICKNESS_M } from '../geometry/pad'
import { masonryReach, roofFacesForFloor, roofInfills, type RoofVertex } from '../geometry/roof'
import { scheduleWall } from '../geometry/schedule'
import { collectLintelSpans, collectWallBlockSpans } from '../geometry/walls'
import { signedPolygonArea, wallLength } from '../model/geom'
import { MORTAR_JOINT, systemOf, wallSystem, WALL_SYSTEMS, type UnitKey, type WallSystem } from '../model/systems'
import type { Document, Floor, FloorFinish, OpeningKind, RoofCovering, SupportType } from '../model/types'
import { COVERINGS, coveringOf, tilesPerM2 } from '../geometry/coverings'
import { layoutSpaces } from '../geometry/spaces'
import { stairConcreteM3, stairVoids } from '../geometry/stairs'
import { supportingFloor } from '../model/stories'
import { assumptionsOf, rateOf } from './rates'
import { FENCES, fencePosts, fenceSpec } from '../model/fences'
import {
  floorSupports,
  pierCourses,
  pierSide,
  pierUnitsPerCourse,
  SUPPORT_HEIGHT_M,
  SUPPORTS,
} from '../model/supports'

const SUPPORT_BASE_M = 0.6
const SUPPORT_BASE_DEPTH_M = 0.3

export type QuantityGroup = 'Masonry' | 'Mortar' | 'Lintels' | 'Openings' | 'Concrete' | 'Finishes' | 'Roof' | 'Supports' | 'Fencing'

export type QuantityUnit = 'each' | 'bag' | 'm' | 'm²' | 'm³'

export type QuantityLine = {
  id: string
  group: QuantityGroup
  label: string
  note: string
  unit: QuantityUnit
  quantity: number
  rateKey: string
  rate: number
  amount: number
}

export const GROUP_ORDER: QuantityGroup[] = ['Masonry', 'Mortar', 'Lintels', 'Openings', 'Concrete', 'Finishes', 'Roof', 'Supports', 'Fencing']

export const LINTEL_STEP_M = 0.15

const HOLLOW_BED_FRACTION = 0.5

export const FINISH_LABEL: Record<FloorFinish, string> = {
  screed: 'Screed',
  tiles: 'Floor tiles',
  timber: 'Timber flooring',
  vinyl: 'Vinyl flooring',
  carpet: 'Carpet',
  none: 'No finish',
}

const OPENING_LABEL: Record<OpeningKind, string> = {
  window: 'Window',
  door: 'Sliding door',
  'external-door': 'External door',
  'internal-door': 'Internal door',
  garage: 'Garage door',
  portal: 'Portal',
}

type Draft = Omit<QuantityLine, 'rate' | 'amount'>

function mm(m: number): number {
  return Math.round(m * 1000)
}

function round(value: number, places: number): number {
  const f = 10 ** places
  return Math.round(value * f) / f
}

function mortarFraction(system: WallSystem): number {
  const unitLength = system.moduleLength - MORTAR_JOINT
  const unitHeight = system.courseHeight - MORTAR_JOINT
  const joints = 1 - (unitLength * unitHeight) / (system.moduleLength * system.courseHeight)
  return system.hollow ? joints * HOLLOW_BED_FRACTION : joints
}

function polygonArea(polygon: DeckPolygon): number {
  const holes = polygon.holes.reduce((sum, hole) => sum + Math.abs(signedPolygonArea(hole)), 0)
  return Math.abs(signedPolygonArea(polygon.outer)) - holes
}

function faceArea(face: RoofVertex[]): number {
  let x = 0
  let y = 0
  let z = 0
  for (let i = 1; i < face.length - 1; i++) {
    const a = face[0]
    const b = face[i]
    const c = face[i + 1]
    const ux = b.x - a.x
    const uy = b.y - a.y
    const uz = b.z - a.z
    const vx = c.x - a.x
    const vy = c.y - a.y
    const vz = c.z - a.z
    x += uy * vz - uz * vy
    y += uz * vx - ux * vz
    z += ux * vy - uy * vx
  }
  return Math.hypot(x, y, z) / 2
}

function floorBelow(doc: Document, floor: Floor): Floor | undefined {
  return supportingFloor(doc, floor)
}

type MasonryTally = { whole: number; cut: number; gable: number }

export function takeoff(doc: Document): QuantityLine[] {
  const assumptions = assumptionsOf(doc.costing)
  const waste = 1 + assumptions.wastePct / 100
  const drafts: Draft[] = []

  const masonry = new Map<UnitKey, MasonryTally>()
  let mortarM3 = 0
  const lintels = new Map<number, number>()
  const openings = new Map<string, { kind: OpeningKind; width: number; height: number; count: number }>()
  let footingLength = 0

  for (const floor of doc.building.floors) {
    for (const wall of floor.walls) {
      if (wall.skin === 'logical') continue
      const system = systemOf(wall)
      const schedule = scheduleWall(floor, wall)
      const tally = masonry.get(system.unitKey) ?? { whole: 0, cut: 0, gable: 0 }
      tally.whole += schedule.wholeBricks
      tally.cut += schedule.cutBricks
      masonry.set(system.unitKey, tally)

      const spans = collectWallBlockSpans(floor, wall)
      const face = spans.reduce((sum, span) => sum + (span.u1 - span.u0) * (span.y1 - span.y0), 0)
      mortarM3 += face * system.leafThickness * mortarFraction(system)
      if (system.leaves === 2 && system.cavity <= MORTAR_JOINT + 1e-9) {
        mortarM3 += (face / 2) * system.cavity
      }

      for (const span of collectLintelSpans(floor, wall)) {
        const stock = round(Math.ceil((span.u1 - span.u0) / LINTEL_STEP_M - 1e-9) * LINTEL_STEP_M, 2)
        lintels.set(stock, (lintels.get(stock) ?? 0) + system.leaves)
      }

      for (const opening of wall.openings) {
        const key = `${opening.kind}:${mm(opening.width)}x${mm(opening.height)}`
        const entry = openings.get(key) ?? { kind: opening.kind, width: opening.width, height: opening.height, count: 0 }
        entry.count += 1
        openings.set(key, entry)
      }

      if (floor.index === 0) footingLength += wallLength(floor.corners, wall.startCornerId, wall.endCornerId)
    }
  }

  const pierSystem = wallSystem(doc.building.wallSystemId)
  const supports = new Map<SupportType, number>()
  let groundSupports = 0
  for (const floor of doc.building.floors) {
    for (const spot of floorSupports(floor)) {
      supports.set(spot.support.type, (supports.get(spot.support.type) ?? 0) + 1)
      if (floor.index === 0) groundSupports += 1
    }
  }
  const piers = supports.get('pier') ?? 0
  if (piers > 0) {
    const tally = masonry.get(pierSystem.unitKey) ?? { whole: 0, cut: 0, gable: 0 }
    tally.whole += piers * pierCourses(pierSystem) * pierUnitsPerCourse(pierSystem)
    masonry.set(pierSystem.unitKey, tally)
    mortarM3 += piers * pierSide(pierSystem) ** 2 * SUPPORT_HEIGHT_M * mortarFraction(pierSystem)
  }

  for (const floor of doc.building.floors) {
    if (!floor.roof || floor.index === 0) continue
    const below = floorBelow(doc, floor)
    if (!below) continue
    const reach = masonryReach(below.walls)
    for (const infill of roofInfills(below, floor, floor.roof, reach)) {
      const system = systemOf(infill.wall)
      const tally = masonry.get(system.unitKey) ?? { whole: 0, cut: 0, gable: 0 }
      tally.gable += infill.blocks.length
      masonry.set(system.unitKey, tally)
      mortarM3 += infill.area * system.leaves * system.leafThickness * mortarFraction(system)
    }
  }

  for (const system of WALL_SYSTEMS) {
    const tally = masonry.get(system.unitKey)
    if (!tally) continue
    masonry.delete(system.unitKey)
    const total = tally.whole + tally.cut + tally.gable
    const gables = tally.gable > 0 ? `, ${tally.gable} in gables` : ''
    drafts.push({
      id: `unit:${system.unitKey}`,
      group: 'Masonry',
      label: system.unitName,
      note: `${tally.whole} whole, ${tally.cut} cut${gables}, ${assumptions.wastePct}% waste`,
      unit: 'each',
      quantity: Math.ceil(total * waste),
      rateKey: `unit:${system.unitKey}`,
    })
  }

  if (mortarM3 > 0) {
    const volume = mortarM3 * (1 + assumptions.mortarAllowancePct / 100)
    drafts.push({
      id: 'mortar-cement',
      group: 'Mortar',
      label: 'Cement 50 kg',
      note: `${round(volume, 2)} m³ of mortar, ${assumptions.mortarAllowancePct}% over the joints, at ${assumptions.cementBagsPerM3} bags per m³`,
      unit: 'bag',
      quantity: Math.ceil(volume * assumptions.cementBagsPerM3),
      rateKey: 'cement-bag',
    })
    drafts.push({
      id: 'mortar-sand',
      group: 'Mortar',
      label: 'Building sand',
      note: `${assumptions.sandM3PerM3} m³ per m³ of mortar`,
      unit: 'm³',
      quantity: round(volume * assumptions.sandM3PerM3, 2),
      rateKey: 'sand-m3',
    })
  }

  for (const [length, count] of [...lintels].sort((a, b) => a[0] - b[0])) {
    drafts.push({
      id: `lintel:${length}`,
      group: 'Lintels',
      label: `Precast lintel ${length.toFixed(2)} m`,
      note: `${count} × ${length.toFixed(2)} m, one per leaf`,
      unit: 'm',
      quantity: round(count * length, 2),
      rateKey: 'lintel-m',
    })
  }

  const openingEntries = [...openings.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  for (const [key, entry] of openingEntries) {
    const size = `${mm(entry.width)} × ${mm(entry.height)}`
    const glazed = entry.kind === 'window'
    drafts.push({
      id: `opening:${key}`,
      group: 'Openings',
      label: `${OPENING_LABEL[entry.kind]} ${size}`,
      note: glazed ? `${entry.count} × ${round(entry.width * entry.height, 2)} m²` : `${entry.count} off`,
      unit: glazed ? 'm²' : 'each',
      quantity: glazed ? round(entry.count * entry.width * entry.height, 2) : entry.count,
      rateKey: glazed ? 'window-m2' : `opening:${entry.kind}`,
    })
  }

  const ground = doc.building.floors.find((floor) => floor.index === 0)
  const pad = groundPad(doc)
  if (pad && ground) {
    const area = pad.structures
      .flatMap((structure) => surfaceBedPolygons(structure.rings, ground))
      .reduce((sum, polygon) => sum + polygonArea(polygon), 0)
    if (area > 0) {
      drafts.push({
        id: 'surface-bed',
        group: 'Concrete',
        label: 'Surface bed',
        note: `${round(area, 1)} m² at ${mm(SURFACE_BED_THICKNESS_M)} mm`,
        unit: 'm³',
        quantity: round(area * SURFACE_BED_THICKNESS_M * waste, 2),
        rateKey: 'concrete-m3',
      })
    }
  }

  if (footingLength > 0) {
    drafts.push({
      id: 'footings',
      group: 'Concrete',
      label: 'Strip footings',
      note: `${round(footingLength, 1)} m at ${mm(assumptions.footingWidth)} × ${mm(assumptions.footingDepth)} mm, assumed section`,
      unit: 'm³',
      quantity: round(footingLength * assumptions.footingWidth * assumptions.footingDepth * waste, 2),
      rateKey: 'concrete-m3',
    })
  }

  let slabArea = 0
  for (const floor of doc.building.floors) {
    if (floor.index === 0 || floor.roof) continue
    slabArea += deckPolygons(floor, stairVoids(doc, floor)).reduce((sum, polygon) => sum + polygonArea(polygon), 0)
  }
  if (slabArea > 0) {
    const thickness = deckThickness()
    drafts.push({
      id: 'suspended-slabs',
      group: 'Concrete',
      label: 'Suspended floor slabs',
      note: `${round(slabArea, 1)} m² at ${mm(thickness)} mm`,
      unit: 'm³',
      quantity: round(slabArea * thickness * waste, 2),
      rateKey: 'concrete-m3',
    })
  }

  let stairVolume = 0
  let stairCount = 0
  for (const floor of doc.building.floors) {
    for (const stair of floor.stairs ?? []) {
      stairVolume += stairConcreteM3(stair, floor.index)
      stairCount += 1
    }
  }
  if (stairCount > 0) {
    drafts.push({
      id: 'stairs',
      group: 'Concrete',
      label: 'Stairs',
      note: `${stairCount} straight ${stairCount === 1 ? 'flight' : 'flights'}, waisted slab`,
      unit: 'm³',
      quantity: round(stairVolume * waste, 2),
      rateKey: 'concrete-m3',
    })
  }

  const finishes = new Map<FloorFinish, { area: number; rooms: number }>()
  for (const floor of doc.building.floors) {
    for (const resolved of layoutSpaces(floor).spaces) {
      const finish = resolved.space.finish
      if (finish === 'none') continue
      const entry = finishes.get(finish) ?? { area: 0, rooms: 0 }
      entry.area += resolved.area
      entry.rooms += 1
      finishes.set(finish, entry)
    }
  }
  for (const finish of Object.keys(FINISH_LABEL) as FloorFinish[]) {
    const entry = finishes.get(finish)
    if (!entry) continue
    drafts.push({
      id: `finish:${finish}`,
      group: 'Finishes',
      label: FINISH_LABEL[finish],
      note: `${entry.rooms} ${entry.rooms === 1 ? 'room' : 'rooms'}, ${round(entry.area, 1)} m² net`,
      unit: 'm²',
      quantity: round(entry.area * waste, 1),
      rateKey: `finish:${finish}`,
    })
  }

  const roofs = new Map<RoofCovering, number>()
  for (const floor of doc.building.floors) {
    if (!floor.roof || floor.index === 0) continue
    const reach = masonryReach(floorBelow(doc, floor)?.walls ?? [])
    const area = roofFacesForFloor(floor, floor.roof, reach).reduce((sum, face) => sum + faceArea(face), 0)
    const covering = coveringOf(floor.roof).id
    roofs.set(covering, (roofs.get(covering) ?? 0) + area)
  }
  for (const spec of COVERINGS) {
    const area = roofs.get(spec.id)
    if (!area) continue
    const tiles = spec.kind === 'tile' ? `, about ${Math.ceil(area * waste * tilesPerM2(spec))} tiles` : ''
    drafts.push({
      id: `roof:${spec.id}`,
      group: 'Roof',
      label: spec.name,
      note: `${round(area, 1)} m² on the slope${tiles}`,
      unit: 'm²',
      quantity: round(area * waste, 1),
      rateKey: `roof:${spec.id}`,
    })
  }

  for (const spec of SUPPORTS) {
    const count = supports.get(spec.id)
    if (!count) continue
    const pier = spec.id === 'pier'
    drafts.push({
      id: `support:${spec.id}`,
      group: 'Supports',
      label: pier ? `${spec.name}s, ${mm(pierSide(pierSystem))} square` : spec.name,
      note: pier
        ? `${pierCourses(pierSystem) * pierUnitsPerCourse(pierSystem)} units each, counted under Masonry`
        : `${mm(SUPPORT_HEIGHT_M)} mm high`,
      unit: 'each',
      quantity: count,
      rateKey: `support:${spec.id}`,
    })
  }
  if (groundSupports > 0) {
    drafts.push({
      id: 'support-bases',
      group: 'Supports',
      label: 'Pad footings under supports',
      note: `${groundSupports} × ${mm(SUPPORT_BASE_M)} × ${mm(SUPPORT_BASE_M)} × ${mm(SUPPORT_BASE_DEPTH_M)} mm`,
      unit: 'm³',
      quantity: round(groundSupports * SUPPORT_BASE_M * SUPPORT_BASE_M * SUPPORT_BASE_DEPTH_M * waste, 2),
      rateKey: 'concrete-m3',
    })
  }

  const fences = new Map<string, { length: number; area: number; posts: number }>()
  for (const floor of doc.building.floors) {
    for (const wall of floor.walls) {
      if (wall.skin !== 'logical' || !wall.fence) continue
      const length = wallLength(floor.corners, wall.startCornerId, wall.endCornerId)
      const tally = fences.get(wall.fence.type) ?? { length: 0, area: 0, posts: 0 }
      tally.length += length
      tally.area += length * wall.fence.height
      tally.posts += fencePosts(length, fenceSpec(wall.fence.type)).length
      fences.set(wall.fence.type, tally)
    }
  }
  for (const spec of FENCES) {
    const tally = fences.get(spec.id)
    if (!tally) continue
    drafts.push({
      id: `fence:${spec.id}`,
      group: 'Fencing',
      label: spec.name,
      note: `${round(tally.length, 1)} m long, ${tally.posts} posts`,
      unit: 'm²',
      quantity: round(tally.area * waste, 1),
      rateKey: `fence:${spec.id}`,
    })
  }

  return drafts.map((draft) => {
    const rate = rateOf(doc.costing, draft.rateKey)
    return { ...draft, rate, amount: round(draft.quantity * rate, 2) }
  })
}

export function totalCost(lines: QuantityLine[]): number {
  return round(
    lines.reduce((sum, line) => sum + line.amount, 0),
    2,
  )
}

function csvCell(value: string | number): string {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function quantitiesCsv(lines: QuantityLine[]): string {
  const rows: (string | number)[][] = [['Group', 'Item', 'Note', 'Quantity', 'Unit', 'Rate (R)', 'Amount (R)']]
  for (const line of lines) {
    rows.push([line.group, line.label, line.note, line.quantity, line.unit, line.rate, line.amount])
  }
  rows.push(['', 'Total', '', '', '', '', totalCost(lines)])
  return rows.map((row) => row.map(csvCell).join(',')).join('\n')
}
