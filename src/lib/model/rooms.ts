import { cornerById, signedPolygonArea } from './geom'
import type { DerivedRoom, Floor } from './types'

export function roomKey(cornerIds: string[]): string {
  return [...cornerIds].sort().join('|')
}

type HalfEdge = {
  fromId: string
  toId: string
  wallId: string
}

function outgoingHeading(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.atan2(to.x - from.x, to.z - from.z)
}

function buildHalfEdges(floor: Floor): HalfEdge[] {
  const edges: HalfEdge[] = []
  for (const wall of floor.walls) {
    const len = wallLength(floor.corners, wall.startCornerId, wall.endCornerId)
    if (len <= 0) continue
    edges.push({
      fromId: wall.startCornerId,
      toId: wall.endCornerId,
      wallId: wall.id,
    })
    edges.push({
      fromId: wall.endCornerId,
      toId: wall.startCornerId,
      wallId: wall.id,
    })
  }
  return edges
}

function wallLength(
  corners: { id: string; x: number; z: number }[],
  startId: string,
  endId: string,
): number {
  const a = cornerById(corners, startId)
  const b = cornerById(corners, endId)
  if (!a || !b) return 0
  return Math.hypot(a.x - b.x, a.z - b.z)
}

function successor(
  floor: Floor,
  incomingFrom: string,
  atCorner: string,
  outgoingByCorner: Map<string, { toId: string; heading: number; wallId: string }[]>,
): HalfEdge | null {
  const from = cornerById(floor.corners, incomingFrom)
  const at = cornerById(floor.corners, atCorner)
  if (!from || !at) return null
  const inAngle = Math.atan2(from.x - at.x, from.z - at.z)
  const outgoing = outgoingByCorner.get(atCorner)
  if (!outgoing || outgoing.length === 0) return null
  let best: (typeof outgoing)[0] | null = null
  let bestHeading = Infinity
  for (const e of outgoing) {
    if (e.heading <= inAngle + 1e-9) continue
    if (e.heading < bestHeading) {
      bestHeading = e.heading
      best = e
    }
  }
  if (!best) {
    best = outgoing.reduce((a, b) => (a.heading < b.heading ? a : b))
  }
  return { fromId: atCorner, toId: best.toId, wallId: best.wallId }
}

function walkFace(
  floor: Floor,
  start: HalfEdge,
  outgoingByCorner: Map<string, { toId: string; heading: number; wallId: string }[]>,
): string[] {
  const cornerIds: string[] = [start.fromId]
  let current: HalfEdge | null = start
  const maxSteps = floor.walls.length * 4 + 4
  for (let step = 0; step < maxSteps; step++) {
    if (!current) break
    const next = successor(floor, current.fromId, current.toId, outgoingByCorner)
    if (!next) break
    if (next.fromId === start.fromId && next.toId === start.toId) {
      return cornerIds
    }
    cornerIds.push(next.fromId)
    current = next
  }
  return cornerIds
}

export function deriveRooms(floor: Floor): DerivedRoom[] {
  const halfEdges = buildHalfEdges(floor)
  const outgoingByCorner = new Map<
    string,
    { toId: string; heading: number; wallId: string }[]
  >()
  for (const he of halfEdges) {
    const from = cornerById(floor.corners, he.fromId)
    const to = cornerById(floor.corners, he.toId)
    if (!from || !to) continue
    const list = outgoingByCorner.get(he.fromId) ?? []
    list.push({ toId: he.toId, heading: outgoingHeading(from, to), wallId: he.wallId })
    outgoingByCorner.set(he.fromId, list)
  }
  for (const [, list] of outgoingByCorner) {
    list.sort((a, b) => a.heading - b.heading)
  }

  const visited = new Set<string>()
  const edgeKey = (he: HalfEdge) => `${he.fromId}->${he.toId}:${he.wallId}`
  const cycles: string[][] = []

  for (const he of halfEdges) {
    const key = edgeKey(he)
    if (visited.has(key)) continue
    const cycle = walkFace(floor, he, outgoingByCorner)
    let walk: HalfEdge | null = he
    for (let i = 0; i < cycle.length && walk; i++) {
      visited.add(edgeKey(walk))
      walk = successor(floor, walk.fromId, walk.toId, outgoingByCorner)
    }
    if (cycle.length >= 3) {
      cycles.push(cycle)
    }
  }

  const rooms: DerivedRoom[] = []
  for (const cycle of cycles) {
    const points = cycle
      .map((id) => cornerById(floor.corners, id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined)
    if (points.length !== cycle.length) continue
    const area = signedPolygonArea(points)
    if (area <= 0) continue
    const key = roomKey(cycle)
    const finishId = floor.roomFinishes[key] ?? 'unfinished'
    rooms.push({ cornerIds: cycle, signedArea: area, finishId })
  }
  return rooms
}
