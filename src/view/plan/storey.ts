import { componentHasRoom, cornerComponents } from '../../lib/model/stories'
import type { Floor } from '../../lib/model/types'

export function storeyAddTarget(
  levelFloors: Floor[],
  selectedCornerId: string | null,
  selectedWallId: string | null,
  selectedPlateFloorId: string | null,
): { floorId: string; cornerId?: string } | null {
  const selectedFloor = levelFloors.find(
    (floor) =>
      (selectedCornerId !== null && floor.corners.some((corner) => corner.id === selectedCornerId)) ||
      (selectedWallId !== null && floor.walls.some((wall) => wall.id === selectedWallId)),
  )
  if (selectedFloor) {
    const cornerId =
      selectedCornerId && selectedFloor.corners.some((corner) => corner.id === selectedCornerId)
        ? selectedCornerId
        : selectedFloor.walls.find((wall) => wall.id === selectedWallId)?.startCornerId
    if (cornerId) return { floorId: selectedFloor.id, cornerId }
  }
  if (selectedPlateFloorId && levelFloors.some((floor) => floor.id === selectedPlateFloorId)) {
    return { floorId: selectedPlateFloorId }
  }
  if (levelFloors.length !== 1) return null
  const only = levelFloors[0]
  if (only.index === 0) {
    const enclosed = cornerComponents(only).filter((ids) => componentHasRoom(only, ids))
    if (enclosed.length !== 1) return null
    return { floorId: only.id, cornerId: enclosed[0][0] }
  }
  return { floorId: only.id, cornerId: only.corners[0]?.id }
}

export function roofableFloor(floors: Floor[], selectedPlateFloorId: string | null): Floor | undefined {
  if (!selectedPlateFloorId) return undefined
  const floor = floors.find((item) => item.id === selectedPlateFloorId)
  if (!floor || floor.index === 0 || floor.walls.length > 0) return undefined
  if (!(floor.outline ?? []).some((ring) => ring.length >= 3)) return undefined
  return floor
}
