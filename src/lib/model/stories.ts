import { connectedCornerIds, pointInRing, structureRings, type Ring } from '../geometry/pad'
import { FLOOR_TO_FLOOR, MAX_STOREYS } from '../plot/fixture'
import { newId } from './id'
import { deriveRooms } from './rooms'
import type { Document, Floor } from './types'

export { MAX_STOREYS }

export function cornerComponents(floor: Floor): string[][] {
  const seen = new Set<string>()
  const groups: string[][] = []
  const ids = new Set<string>(floor.corners.map((corner) => corner.id))
  for (const wall of floor.walls) {
    ids.add(wall.startCornerId)
    ids.add(wall.endCornerId)
  }
  for (const id of ids) {
    if (seen.has(id)) continue
    const group = connectedCornerIds(floor, id)
    for (const member of group) seen.add(member)
    groups.push(group)
  }
  return groups
}

export function componentHasRoom(floor: Floor, cornerIds: string[]): boolean {
  const keep = new Set(cornerIds)
  return deriveRooms(floor).some((room) => room.cornerIds.some((id) => keep.has(id)))
}

export function pointInsideRings(rings: Ring[], x: number, z: number): boolean {
  return rings.some((ring) => pointInRing(ring, x, z))
}

export function segmentInsideRings(
  rings: Ring[],
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): boolean {
  if (rings.length === 0) return false
  const length = Math.hypot(x1 - x0, z1 - z0)
  const steps = Math.max(1, Math.ceil(length / 0.05))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    if (!pointInsideRings(rings, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false
  }
  return true
}

export function storeyFootprint(document: Document, floor: Floor): Ring[] | null {
  if (floor.index === 0 || !floor.unitId) return null
  const ground = document.building.floors.find((item) => item.index === 0)
  if (floor.index === 1) {
    if (!ground) return []
    const ids = ground.corners.filter((corner) => corner.unitId === floor.unitId).map((corner) => corner.id)
    return componentRings(ground, ids)
  }
  const below = document.building.floors.find(
    (item) => item.unitId === floor.unitId && item.index === floor.index - 1,
  )
  if (!below) return []
  return roofedRings(below)
}

export function supportingFloor(document: Document, floor: Floor): Floor | undefined {
  if (floor.index === 0 || !floor.unitId) return undefined
  if (floor.index === 1) {
    const ground = document.building.floors.find((item) => item.index === 0)
    if (!ground) return undefined
    const corners = ground.corners.filter((corner) => corner.unitId === floor.unitId)
    const ids = new Set(corners.map((corner) => corner.id))
    const walls = ground.walls.filter((wall) => ids.has(wall.startCornerId) && ids.has(wall.endCornerId))
    return { ...ground, corners, walls }
  }
  return document.building.floors.find((item) => item.unitId === floor.unitId && item.index === floor.index - 1)
}

export function storeyUnderlay(document: Document, activeIndex: number): Ring[] {
  if (activeIndex <= 0) return []
  const ground = document.building.floors.find((floor) => floor.index === 0)
  if (!ground) return []
  const rings: Ring[] = []
  for (const ids of cornerComponents(ground)) {
    if (!componentHasRoom(ground, ids)) continue
    const unitId = ground.corners.find((corner) => ids.includes(corner.id))?.unitId
    if (unitId && document.building.floors.some((floor) => floor.unitId === unitId && floor.index === activeIndex)) {
      continue
    }
    let best: Floor | undefined
    if (unitId) {
      for (const floor of document.building.floors) {
        if (floor.unitId !== unitId || floor.index <= 0 || floor.index >= activeIndex) continue
        if (!best || floor.index > best.index) best = floor
      }
    }
    rings.push(...(best ? structureRings(best) : componentRings(ground, ids)))
  }
  return rings
}

export function topStoreyIndex(document: Document, unitId: string): number {
  let top = 0
  for (const floor of document.building.floors) {
    if (floor.unitId === unitId) top = Math.max(top, floor.index)
  }
  return top
}

function componentRings(floor: Floor, ids: string[]): Ring[] {
  const keep = new Set(ids)
  return roofedRings({
    ...floor,
    corners: floor.corners.filter((corner) => keep.has(corner.id)),
    walls: floor.walls.filter((wall) => keep.has(wall.startCornerId) && keep.has(wall.endCornerId)),
  })
}

// The rooms of a storey that something can stand over: all of them but those marked open to the sky.
export function roofedRings(floor: Floor): Ring[] {
  const open = (floor.spaces ?? []).filter((space) => space.open).flatMap((space) => space.seeds)
  const rings = structureRings(floor)
  return open.length === 0 ? rings : rings.filter((ring) => !open.some((seed) => pointInRing(ring, seed.x, seed.z)))
}

// The named rooms under a storey, open ones included, for saying which of them a roof leaves out.
export function roomsUnder(document: Document, floor: Floor): { floorId: string; space: NonNullable<Floor['spaces']>[number] }[] {
  const below = supportingFloor(document, floor)
  if (!below) return []
  const rings = structureRings(below)
  return (below.spaces ?? []).filter((space) => space.seeds.some((seed) => rings.some((ring) => pointInRing(ring, seed.x, seed.z)))).map((space) => ({ floorId: below.id, space }))
}

function cornersInside(floor: Floor, rings: Ring[]): number {
  let count = 0
  for (const corner of floor.corners) {
    if (pointInsideRings(rings, corner.x, corner.z)) count += 1
  }
  return count
}

function replaceFloorIn(document: Document, floor: Floor): Document {
  return {
    ...document,
    building: {
      ...document.building,
      floors: document.building.floors.map((item) => (item.id === floor.id ? floor : item)),
    },
  }
}

function stampCorners(floor: Floor, ids: Set<string>, unitId: string): Floor {
  return {
    ...floor,
    corners: floor.corners.map((corner) => (ids.has(corner.id) ? { ...corner, unitId } : corner)),
  }
}

function clearStamps(floor: Floor, ids: Set<string>): Floor {
  return {
    ...floor,
    corners: floor.corners.map((corner) => {
      if (!ids.has(corner.id) || !corner.unitId) return corner
      const { unitId: _unitId, ...rest } = corner
      return rest
    }),
  }
}

function uniqueUnitIds(floor: Floor, ids: string[]): string[] {
  const found = new Set<string>()
  for (const id of ids) {
    const unitId = floor.corners.find((corner) => corner.id === id)?.unitId
    if (unitId) found.add(unitId)
  }
  return [...found]
}

function combineFloors(list: Floor[]): Floor {
  const [first, ...rest] = list
  if (!first || rest.length === 0) return first
  return {
    ...first,
    corners: list.flatMap((floor) => floor.corners),
    walls: list.flatMap((floor) => floor.walls),
    roomFinishes: Object.assign({}, ...list.map((floor) => floor.roomFinishes)),
    spaces: list.flatMap((floor) => floor.spaces ?? []),
    stairs: list.flatMap((floor) => floor.stairs ?? []),
    outline: list.flatMap((floor) => floor.outline ?? []),
  }
}

function mergeUnits(document: Document, keep: string, drop: string): Document {
  if (keep === drop) return document
  const rewritten = document.building.floors.map((floor) => {
    if (floor.index === 0) {
      return {
        ...floor,
        corners: floor.corners.map((corner) =>
          corner.unitId === drop ? { ...corner, unitId: keep } : corner,
        ),
      }
    }
    return floor.unitId === drop ? { ...floor, unitId: keep } : floor
  })
  const groundFloors = rewritten.filter((floor) => floor.index === 0)
  const others = rewritten.filter((floor) => floor.index > 0 && floor.unitId !== keep)
  const mine = rewritten.filter((floor) => floor.unitId === keep && floor.index > 0)
  const byIndex = new Map<number, Floor[]>()
  for (const floor of mine) {
    const list = byIndex.get(floor.index) ?? []
    list.push(floor)
    byIndex.set(floor.index, list)
  }
  return {
    ...document,
    building: {
      ...document.building,
      floors: [...groundFloors, ...others, ...[...byIndex.values()].map((list) => combineFloors(list))],
    },
  }
}

function splitUnit(document: Document, unitId: string, comps: string[][]): Document {
  const ground = document.building.floors.find((floor) => floor.index === 0)
  if (!ground || comps.length < 2) return document
  const uppers = document.building.floors.filter((floor) => floor.unitId === unitId && floor.index > 0)
  const scored = comps.map((ids) => {
    const rings = componentRings(ground, ids)
    return {
      ids,
      rings,
      score: uppers.reduce((sum, floor) => sum + cornersInside(floor, rings), 0),
    }
  })
  scored.sort((a, b) => b.score - a.score || b.ids.length - a.ids.length)
  const keeper = scored[0]
  if (!keeper) return document
  let next = document
  let floor = ground
  for (const comp of scored.slice(1)) {
    const mine = uppers.filter(
      (item) => cornersInside(item, comp.rings) > cornersInside(item, keeper.rings),
    )
    if (mine.length === 0) {
      floor = clearStamps(floor, new Set(comp.ids))
      next = replaceFloorIn(next, floor)
      continue
    }
    const nextId = newId('unit')
    floor = stampCorners(floor, new Set(comp.ids), nextId)
    next = replaceFloorIn(next, floor)
    next = {
      ...next,
      building: {
        ...next.building,
        floors: next.building.floors.map((item) =>
          mine.some((kept) => kept.id === item.id) ? { ...item, unitId: nextId } : item,
        ),
      },
    }
    floor = next.building.floors.find((item) => item.index === 0) ?? floor
  }
  return next
}

export function syncGroundUnits(document: Document): Document {
  let doc = document
  const groundOf = () => doc.building.floors.find((floor) => floor.index === 0)
  const initial = groundOf()
  if (!initial) return doc

  for (const group of cornerComponents(initial)) {
    const floor = groundOf()
    if (!floor) return doc
    const unitIds = uniqueUnitIds(floor, group)
    if (unitIds.length === 0) continue
    const keep = unitIds[0]
    for (const drop of unitIds.slice(1)) doc = mergeUnits(doc, keep, drop)
    const stamped = groundOf()
    if (!stamped) return doc
    doc = replaceFloorIn(doc, stampCorners(stamped, new Set(group), keep))
  }

  const floor = groundOf()
  if (!floor) return doc
  const byUnit = new Map<string, string[][]>()
  for (const group of cornerComponents(floor)) {
    const unitId = uniqueUnitIds(floor, group)[0]
    if (!unitId) continue
    const list = byUnit.get(unitId) ?? []
    list.push(group)
    byUnit.set(unitId, list)
  }
  for (const [unitId, comps] of byUnit) {
    if (comps.length < 2) continue
    doc = splitUnit(doc, unitId, comps)
  }

  const live = new Set<string>()
  for (const corner of groundOf()?.corners ?? []) {
    if (corner.unitId) live.add(corner.unitId)
  }
  return {
    ...doc,
    building: {
      ...doc.building,
      floors: doc.building.floors.filter(
        (item) => item.index === 0 || (item.unitId !== undefined && live.has(item.unitId)),
      ),
    },
  }
}

function plateRings(floor: Floor, cornerIds?: string[]): Ring[] {
  if (cornerIds) {
    const rooms = componentRings(floor, cornerIds)
    if (rooms.length > 0) return rooms
  }
  return structureRings(floor)
}

function sameRings(a: Ring[], b: Ring[]): boolean {
  if (a.length !== b.length) return false
  return a.every(
    (ring, i) =>
      ring.length === b[i].length &&
      ring.every((point, j) => Math.abs(point.x - b[i][j].x) < 1e-9 && Math.abs(point.z - b[i][j].z) < 1e-9),
  )
}

// An upper storey stands on the rooms enclosed below it, solid or logical walls alike, never on open floor.
export function syncOutlines(document: Document): Document {
  let changed = false
  const floors = document.building.floors.map((floor) => {
    const footprint = storeyFootprint(document, floor)
    if (footprint === null) return floor
    const outline = footprint.map((ring) => ring.map((point) => ({ x: point.x, z: point.z })))
    if (sameRings(floor.outline ?? [], outline)) return floor
    changed = true
    return { ...floor, outline }
  })
  return changed ? { ...document, building: { ...document.building, floors } } : document
}

export function blankStorey(outline: Ring[], unitId: string, index: number): Floor {
  return {
    id: newId('floor'),
    index,
    datumHeight: index * FLOOR_TO_FLOOR,
    unitId,
    corners: [],
    walls: [],
    roomFinishes: {},
    outline: outline.map((ring) => ring.map((point) => ({ x: point.x, z: point.z }))),
  }
}

export function prepareStorey(
  document: Document,
  floorId: string,
  cornerId?: string,
): { document: Document; unitId: string; outline: Ring[] } | { reason: string } {
  const floor = document.building.floors.find((item) => item.id === floorId)
  if (!floor) return { reason: 'floor not found' }
  if (floor.index === 0 && (!cornerId || !floor.corners.some((corner) => corner.id === cornerId))) {
    return { reason: 'corner not found' }
  }
  const component = cornerId ? connectedCornerIds(floor, cornerId) : []
  const existingUnit =
    floor.index === 0
      ? floor.corners.find((corner) => component.includes(corner.id))?.unitId
      : floor.unitId
  if (floor.index > 0 && !existingUnit) return { reason: 'floor not found' }
  const top = existingUnit ? topStoreyIndex(document, existingUnit) : 0
  if (top + 1 >= MAX_STOREYS) return { reason: 'storey limit' }

  if (floor.index === 0) {
    const outline = plateRings(floor, component)
    if (outline.length === 0) return { reason: 'enclose a room first' }
    const unitId = existingUnit ?? newId('unit')
    const stamped = replaceFloorIn(document, stampCorners(floor, new Set(component), unitId))
    if (top === 0) return { document: stamped, unitId, outline }
    const source = stamped.building.floors.find((item) => item.unitId === unitId && item.index === top)
    const upper = source ? plateRings(source) : []
    if (upper.length === 0) return { reason: 'enclose a room first' }
    return { document: stamped, unitId, outline: upper }
  }

  const source = document.building.floors.find((item) => item.unitId === existingUnit && item.index === top)
  if (!source || !existingUnit) return { reason: 'floor not found' }
  const outline = plateRings(source)
  if (outline.length === 0) return { reason: 'enclose a room first' }
  return { document, unitId: existingUnit, outline }
}
