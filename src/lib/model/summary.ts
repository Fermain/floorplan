import { layoutSpaces } from '../geometry/spaces'
import { signedPolygonArea } from './geom'
import type { Document } from './types'

// A project at a glance, for the picker: the size of the plot and of the house on it.
export type ProjectFacts = { plotArea: number; storeys: number; rooms: number; floorArea: number }

export function projectFacts(doc: Document): ProjectFacts {
  const built = doc.building.floors.filter((floor) => !floor.roof && floor.walls.some((wall) => wall.skin !== 'logical'))
  let rooms = 0
  let floorArea = 0
  for (const floor of built) {
    const layout = layoutSpaces(floor)
    rooms += layout.spaces.length
    floorArea += layout.spaces.reduce((sum, resolved) => sum + resolved.area, 0) + layout.loose.reduce((sum, cell) => sum + cell.netArea, 0)
  }
  return {
    plotArea: Math.abs(signedPolygonArea(doc.plot.ring.map(([x, z]) => ({ x, z })))),
    storeys: new Set(built.map((floor) => floor.index)).size,
    rooms,
    floorArea,
  }
}
