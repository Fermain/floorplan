import { BufferGeometry, CylinderGeometry, Matrix4 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { coveringOf } from './coverings'
import { fixtureStandAboveDatum } from './fixtures'
import { floorWorldDatum, groundPad, pointInRing, wallDatum } from './pad'
import { masonryReach, roofFacesForFloor } from './roof'
import { cellAt, floorCells } from './spaces'
import { signedPolygonArea } from '../model/geom'
import { DEFAULT_WOOD_BURNER_KW, fixtureSize, WOOD_BURNER_KWS, WOOD_BURNER_SIZES } from '../model/fixtures'
import { supportingFloor } from '../model/stories'
import type { Document, Fixture, Floor, WoodBurnerKw } from '../model/types'
import { FLOOR_TO_FLOOR, WALL_HEAD } from '../plot/fixture'

export const FLUE_PROJECTION_ABOVE_ROOF_M = 1.0

export type RoofHeightResult = {
  roofFloorId: string
  roofUnderY: number
  roofTopY: number
  pitchDeg: number
}

export type PlacedWoodBurner = {
  floor: Floor
  fixture: Fixture
  kw: WoodBurnerKw
  flueX: number
  flueZ: number
  stoveBaseY: number
  stoveTopY: number
  ceilingY: number
  roofUnderY: number | null
  roofTopY: number | null
  cowlY: number
  flueLength: number
  roofFloorId: string | null
  roomAreaM2: number | null
  roomName: string | null
}

export type ChimneyIssue = {
  id: string
  text: string
  floorId?: string
  fixtureId?: string
}

export type ChimneyLayout = {
  woodBurners: PlacedWoodBurner[]
  totalFlueLength: number
  totalKw: number
  issues: ChimneyIssue[]
}

export type ChimneyPart = {
  geometry: BufferGeometry
  colour: string
  roughness: number
  metalness: number
  roofFloorId?: string
}

export function fluePlanPosition(fixture: Fixture): { x: number; z: number } {
  const size = fixtureSize(fixture)
  const flueOut = size.depth * 0.4
  return {
    x: fixture.x + fixture.dx * (flueOut - size.depth / 2),
    z: fixture.z + fixture.dz * (flueOut - size.depth / 2),
  }
}

function floorSupportDatum(doc: Document, floor: Floor): number {
  const pad = groundPad(doc)
  if (!pad) return 0
  for (const wall of floor.walls) {
    const datum = wallDatum(floor, wall, pad)
    if (datum !== null) return datum
  }
  return pad.structures[0]?.datum ?? 0
}

export function roofHeightAt(doc: Document, x: number, z: number, minFloorIndex = 0): RoofHeightResult | null {
  const roofFloors = doc.building.floors
    .filter((f) => f.roof && f.index !== 0 && f.index > minFloorIndex)
    .sort((a, b) => a.index - b.index)

  for (const floor of roofFloors) {
    const roof = floor.roof
    if (!roof) continue
    const below = supportingFloor(doc, floor)
    const reach = masonryReach(below?.walls ?? [])
    const supportFloor = below ?? floor
    const supportDatum = below ? below.datumHeight : floor.datumHeight - FLOOR_TO_FLOOR
    const grade = floorSupportDatum(doc, supportFloor)
    const roofBaseY = floorWorldDatum(supportDatum, grade) + WALL_HEAD
    const spec = coveringOf(roof)
    const faces = roofFacesForFloor(floor, roof, reach)

    for (const face of faces) {
      if (face.length < 3) continue
      const ring = face.map((v) => ({ x: v.x, z: v.z }))
      if (!pointInRing(ring, x, z)) continue

      let nx = 0
      let ny = 0
      let nz = 0
      for (let i = 0; i < face.length; i++) {
        const a = face[i]
        const b = face[(i + 1) % face.length]
        nx += (a.y - b.y) * (a.z + b.z)
        ny += (a.z - b.z) * (a.x + b.x)
        nz += (a.x - b.x) * (a.y + b.y)
      }
      if (ny < 0) {
        nx = -nx
        ny = -ny
        nz = -nz
      }
      const len = Math.hypot(nx, ny, nz) || 1
      const cos = ny / len
      const lift = spec.depth / Math.max(cos, 0.05)
      const p0 = face[0]
      const y = Math.abs(ny) > 1e-6 ? p0.y - (nx * (x - p0.x) + nz * (z - p0.z)) / ny : p0.y

      return {
        roofFloorId: floor.id,
        roofUnderY: roofBaseY + y,
        roofTopY: roofBaseY + y + lift,
        pitchDeg: roof.pitchDeg,
      }
    }
  }
  return null
}

export function recommendedWoodBurnerKw(areaM2: number): WoodBurnerKw {
  for (const kw of WOOD_BURNER_KWS) {
    if (areaM2 <= WOOD_BURNER_SIZES[kw].m2Max) return kw
  }
  return 14
}

export function chimneyLayout(doc: Document): ChimneyLayout {
  const woodBurners: PlacedWoodBurner[] = []
  const issues: ChimneyIssue[] = []

  for (const floor of doc.building.floors) {
    for (const fixture of floor.fixtures ?? []) {
      if (fixture.kind !== 'wood-burner') continue
      const kw = fixture.kw ?? DEFAULT_WOOD_BURNER_KW
      const fluePos = fluePlanPosition(fixture)
      const floorDatum = floorWorldDatum(floor.datumHeight, floorSupportDatum(doc, floor))
      const stoveBaseY = floorDatum + fixtureStandAboveDatum(doc, floor, fixture) + fixture.y
      const size = fixtureSize(fixture)
      const stoveTopY = stoveBaseY + size.height
      const ceilingY = stoveBaseY + WALL_HEAD

      const roof = roofHeightAt(doc, fluePos.x, fluePos.z, floor.index)
      const roofFloorId = roof?.roofFloorId ?? null
      const roofUnderY = roof?.roofUnderY ?? null
      const roofTopY = roof?.roofTopY ?? null
      const cowlY = roofTopY !== null ? roofTopY + FLUE_PROJECTION_ABOVE_ROOF_M : ceilingY + 1.2
      const flueLength = Math.max(1.0, cowlY - stoveTopY)

      const cells = floorCells(floor)
      const cell = cellAt(cells, fixture.x, fixture.z)
      const roomAreaM2 = cell ? Math.abs(signedPolygonArea(cell.ring)) : null
      const space = cell ? (floor.spaces ?? []).find((s) => s.seeds.some((seed) => pointInRing(cell.ring, seed.x, seed.z))) : null
      const roomName = space?.name ?? null
      const finish = space?.finish ?? floor.roomFinishes[space?.name ?? ''] ?? 'screed'

      woodBurners.push({
        floor,
        fixture,
        kw,
        flueX: fluePos.x,
        flueZ: fluePos.z,
        stoveBaseY,
        stoveTopY,
        ceilingY,
        roofUnderY,
        roofTopY,
        cowlY,
        flueLength,
        roofFloorId,
        roomAreaM2,
        roomName,
      })

      if (!roof) {
        issues.push({
          id: `no-roof:${fixture.id}`,
          text: `Wood burner has no roof above it for the chimney flue to exit through.`,
          floorId: floor.id,
          fixtureId: fixture.id,
        })
      }

      if (roomAreaM2 !== null) {
        const maxArea = WOOD_BURNER_SIZES[kw].m2Max
        if (roomAreaM2 > maxArea * 1.25) {
          const rec = recommendedWoodBurnerKw(roomAreaM2)
          issues.push({
            id: `undersized:${fixture.id}`,
            text: `The ${kw} kW wood burner may be undersized for ${roomName ? 'the ' + roomName : 'this room'} (${Math.round(roomAreaM2)} m²); a ${rec} kW unit is recommended.`,
            floorId: floor.id,
            fixtureId: fixture.id,
          })
        } else if (roomAreaM2 < 18 && kw >= 12) {
          issues.push({
            id: `oversized:${fixture.id}`,
            text: `The ${kw} kW wood burner is oversized for ${roomName ? 'the ' + roomName : 'a small room'} (${Math.round(roomAreaM2)} m²); consider an 8 kW or 10 kW unit.`,
            floorId: floor.id,
            fixtureId: fixture.id,
          })
        }
      }

      if (finish === 'timber' || finish === 'carpet') {
        issues.push({
          id: `hearth:${fixture.id}`,
          text: `Wood burner in a room with ${finish} flooring needs a non-combustible hearth plate.`,
          floorId: floor.id,
          fixtureId: fixture.id,
        })
      }
    }
  }

  const totalFlueLength = woodBurners.reduce((sum, item) => sum + item.flueLength, 0)
  const totalKw = woodBurners.reduce((sum, item) => sum + item.kw, 0)

  return { woodBurners, totalFlueLength, totalKw, issues }
}

const STAINLESS_FINISH = { colour: '#a1a1aa', roughness: 0.35, metalness: 0.75 }
const FLASHING_FINISH = { colour: '#3f3f46', roughness: 0.6, metalness: 0.3 }

export function buildChimneyParts(doc: Document): ChimneyPart[] {
  const layout = chimneyLayout(doc)
  const byRoofAndFinish = new Map<string, { finish: typeof STAINLESS_FINISH; roofFloorId?: string; list: BufferGeometry[] }>()

  const addGeom = (geom: BufferGeometry, finish: typeof STAINLESS_FINISH, roofFloorId?: string) => {
    const key = `${roofFloorId ?? 'default'}:${finish.colour}`
    const bucket = byRoofAndFinish.get(key) ?? { finish, roofFloorId, list: [] }
    bucket.list.push(geom.index ? geom.toNonIndexed() : geom)
    byRoofAndFinish.set(key, bucket)
  }

  for (const burner of layout.woodBurners) {
    const flueR = WOOD_BURNER_SIZES[burner.kw].flueDia / 2
    const { flueX, flueZ, cowlY, roofUnderY, roofTopY, ceilingY, roofFloorId } = burner

    const pipeBottomY = roofUnderY !== null ? roofUnderY - 0.08 : ceilingY
    const pipeTopY = cowlY - 0.15
    const pipeLength = Math.max(0.1, pipeTopY - pipeBottomY)
    const pipeMidY = (pipeTopY + pipeBottomY) / 2

    // Insulated stainless exterior flue pipe
    const pipeGeom = new CylinderGeometry(flueR, flueR, pipeLength, 24)
    pipeGeom.applyMatrix4(new Matrix4().makeTranslation(flueX, pipeMidY, flueZ))
    addGeom(pipeGeom, STAINLESS_FINISH, roofFloorId ?? undefined)

    // Storm collar / roof penetration flashing cone
    const flashBaseY = roofTopY !== null ? roofTopY : ceilingY + 0.6
    const flashH = 0.12
    const flashGeom = new CylinderGeometry(flueR + 0.02, flueR + 0.11, flashH, 24)
    flashGeom.applyMatrix4(new Matrix4().makeTranslation(flueX, flashBaseY + flashH / 2, flueZ))
    addGeom(flashGeom, FLASHING_FINISH, roofFloorId ?? undefined)

    // Cowl assembly at top of stack:
    // 1. Spigot base collar
    const collarH = 0.14
    const collarGeom = new CylinderGeometry(flueR + 0.015, flueR + 0.015, collarH, 24)
    collarGeom.applyMatrix4(new Matrix4().makeTranslation(flueX, cowlY - collarH / 2, flueZ))
    addGeom(collarGeom, STAINLESS_FINISH, roofFloorId ?? undefined)

    // 2. Wind band / cowl outer skirt
    const bandH = 0.15
    const bandGeom = new CylinderGeometry(flueR + 0.065, flueR + 0.065, bandH, 24)
    bandGeom.applyMatrix4(new Matrix4().makeTranslation(flueX, cowlY + 0.02, flueZ))
    addGeom(bandGeom, STAINLESS_FINISH, roofFloorId ?? undefined)

    // 3. Conical rain hat
    const hatH = 0.08
    const hatGeom = new CylinderGeometry(0.01, flueR + 0.095, hatH, 24)
    hatGeom.applyMatrix4(new Matrix4().makeTranslation(flueX, cowlY + 0.13, flueZ))
    addGeom(hatGeom, STAINLESS_FINISH, roofFloorId ?? undefined)
  }

  const out: ChimneyPart[] = []
  for (const { finish, roofFloorId, list } of byRoofAndFinish.values()) {
    const merged = mergeGeometries(list, false)
    for (const g of list) g.dispose()
    if (merged) {
      out.push({
        geometry: merged,
        colour: finish.colour,
        roughness: finish.roughness,
        metalness: finish.metalness,
        roofFloorId,
      })
    }
  }

  return out
}
