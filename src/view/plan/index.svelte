<script lang="ts">
  import { contourPlanPaths } from '../../lib/geometry/contours'
  import { masonryReach, roofPlan } from '../../lib/geometry/roof'
  import { storeyHasLongSolidWall } from '../../lib/geometry/limits'
  import { isUnlandedWall } from '../../lib/geometry/support'
  import { connectedCornerIds, groundPad, levelField } from '../../lib/geometry/pad'
  import { solidWallPolygonsForFloor, type SvgPoint } from '../../lib/export/svg'
  import { cornerById } from '../../lib/model/geom'
  import { deriveRooms } from '../../lib/model/rooms'
  import {
    pointInsideRings,
    storeyFootprint,
    storeyUnderlay,
    MAX_STOREYS,
    topStoreyIndex,
  } from '../../lib/model/stories'
  import type { Floor, WallSkin } from '../../lib/model/types'
  import { pointInPlot, segmentAllowedInPlot } from '../../lib/model/plot-check'
  import { DEFAULT_ROOF_EAVES, DEFAULT_ROOF_PITCH_DEG } from '../../lib/plot/fixture'
  import { documentStore } from '../../lib/state/document.svelte'
  import {
    nearestCorner,
    nearestWallPoint,
    alignTranslation,
    nearestPlotEdge,
    nearestRingEdge,
    nearestNode,
    segmentDistance,
    CORNER_SNAP_M,
    MIN_TURN_DEG,
    type SnapTrace,
  } from './snap'
  import { angleReadout, lengthReadout, resolveWallEnd } from './draw'
  import {
    cornerIdAt,
    gridFromSegment,
    NODE_HIT_M,
    pickWall,
    previewFloor,
    roomAtPoint,
    roomPolygonPoints,
    ROTATE_HIT_M,
    ROTATE_ICON,
    ROTATE_OFFSET_M,
    rotationStaysInPlot,
    snapTurn,
    translationStaysInPlot,
    turnLabel,
  } from './gesture'
  import { roofableFloor, storeyAddTarget } from './storey'
  import { plotBounds, pointsAttr, ringPath } from './svg'

  type Tool = 'draw-double' | 'draw-logical' | 'select'

  const PLOT_MARGIN_M = 1

  type PendingDraw = {
    startCornerId?: string
    startPoint?: { x: number; z: number }
  }

  let {
    selectedWallId = $bindable<string | null>(null),
    activeFloorId = $bindable(''),
  }: {
    selectedWallId?: string | null
    activeFloorId?: string
  } = $props()

  let tool = $state<Tool>('select')
  let pendingDraw = $state<PendingDraw | null>(null)
  let chainOriginId = $state<string | null>(null)
  let errorMessage = $state<string | null>(null)
  let pointerPlan = $state<{ x: number; z: number } | null>(null)
  let svgEl = $state<SVGSVGElement | undefined>(undefined)
  let moveDrag = $state<{
    nodeId: string
    cornerIds: string[]
    startX: number
    startZ: number
    dx: number
    dz: number
    traces: SnapTrace[]
  } | null>(null)
  let rotateDrag = $state<{
    pivotId: string
    cornerIds: string[]
    originAngle: number
    angle: number
    snapped: boolean
  } | null>(null)
  let selectedEdge = $state<number | null>(null)
  let selectedOutline = $state<{ floorId: string | null; ring: number; edge: number } | null>(null)
  let selectedCornerId = $state<string | null>(null)
  let selectedPlateFloorId = $state<string | null>(null)
  let selectedPlateRing = $state<number | null>(null)
  let hoverNodeId = $state<string | null>(null)
  let activeStoreyIndex = $state(0)

  $effect(() => {
    const floors = documentStore.document.building.floors
    const atLevel = floors.filter((floor) => floor.index === activeStoreyIndex)
    if (atLevel.length === 0) {
      activeStoreyIndex = 0
      activeFloorId = floors[0]?.id ?? ''
      return
    }
    if (!atLevel.some((floor) => floor.id === activeFloorId)) {
      activeFloorId = atLevel[0].id
    }
  })

  const document = $derived(documentStore.document)
  const plotRing = $derived(document.plot.ring)
  const floors = $derived(document.building.floors)
  const levelFloors = $derived(floors.filter((floor) => floor.index === activeStoreyIndex))
  const storeyIndexes = $derived.by(() => {
    let max = 0
    for (const floor of floors) max = Math.max(max, floor.index)
    return Array.from({ length: max + 1 }, (_, index) => index)
  })
  const underlay = $derived(storeyUnderlay(document, activeStoreyIndex))
  const plates = $derived(
    levelFloors.flatMap((floor) =>
      (floor.outline ?? []).map((ring, index) => ({ floorId: floor.id, index, ring })),
    ),
  )
  const roofDrawings = $derived(
    levelFloors.flatMap((floor) => {
      if (!floor.roof) return []
      const below = floors.find((item) => item.unitId === floor.unitId && item.index === floor.index - 1)
      return [
        {
          floorId: floor.id,
          plan: roofPlan(floor, floor.roof, masonryReach(below?.walls ?? [])),
        },
      ]
    }),
  )
  const activeFloor = $derived.by((): Floor | undefined => {
    if (levelFloors.length === 0) return undefined
    if (levelFloors.length === 1) return levelFloors[0]
    return {
      id: levelFloors[0].id,
      index: activeStoreyIndex,
      datumHeight: levelFloors[0].datumHeight,
      corners: levelFloors.flatMap((floor) => floor.corners),
      walls: levelFloors.flatMap((floor) => floor.walls),
      roomFinishes: Object.assign({}, ...levelFloors.map((floor) => floor.roomFinishes)),
    }
  })

  const bounds = $derived(plotBounds(plotRing, PLOT_MARGIN_M))
  const viewBox = $derived(
    `${bounds.minX} ${bounds.minZ} ${bounds.maxX - bounds.minX} ${bounds.maxZ - bounds.minZ}`,
  )

  const displayFloor = $derived(activeFloor ? previewFloor(activeFloor, rotateDrag, moveDrag) : undefined)
  const wallPolygons = $derived(displayFloor ? solidWallPolygonsForFloor(displayFloor) : [])
  const rooms = $derived(displayFloor ? deriveRooms(displayFloor) : [])
  const logicalWalls = $derived(displayFloor?.walls.filter((w) => w.skin === 'logical') ?? [])
  const unlandedWallIds = $derived.by(() => {
    if (activeStoreyIndex <= 0) return new Set<string>()
    const ids = new Set<string>()
    for (const floor of levelFloors) {
      for (const wall of floor.walls) {
        if (isUnlandedWall(document, floor, wall)) ids.add(wall.id)
      }
    }
    return ids
  })
  const showUnlandedWarning = $derived(
    tool === 'select' || tool === 'draw-double' || tool === 'draw-logical',
  )
  const contours = $derived.by(() => {
    const pad = groundPad(document)
    const field = pad ? levelField(document.heightfield, pad.structures) : document.heightfield
    return contourPlanPaths(field)
  })

  function plateFill(floorId: string, ring: number): string {
    const roofed = levelFloors.some((floor) => floor.id === floorId && floor.roof)
    const selected = floorId === selectedPlateFloorId && ring === selectedPlateRing
    if (selected && roofed) return '#d7dbe0'
    if (selected) return '#e7e5e4'
    if (roofed) return '#c5c9ce'
    return '#d6d3d1'
  }

  function clientToPlan(svg: SVGSVGElement, clientX: number, clientY: number) {
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const local = pt.matrixTransform(ctm.inverse())
    return { x: local.x, z: local.y }
  }

  function explain(reason: string): string {
    if (reason === 'wall outside plot') return 'That wall leaves the plot. Click an end inside the outline.'
    if (reason === 'degenerate wall') return 'The end is too close to the start.'
    if (reason === 'enclose a room first') return 'Close a room before adding a storey.'
    if (reason === 'storey limit') return 'This building already has 4 storeys.'
    return reason
  }

  function applyResult(result: { ok: boolean; reason?: string }) {
    if (result.ok) {
      errorMessage = null
      return true
    }
    errorMessage = explain(result.reason ?? 'action failed')
    return false
  }

  function startCoords(floor: Floor, pending: PendingDraw): { x: number; z: number } | null {
    if (pending.startCornerId) {
      const c = cornerById(floor.corners, pending.startCornerId)
      return c ? { x: c.x, z: c.z } : null
    }
    return pending.startPoint ?? null
  }

  function floorIdFor(cornerId: string): string | undefined {
    return levelFloors.find((floor) => floor.corners.some((corner) => corner.id === cornerId))?.id
  }

  function floorIdForPoint(x: number, z: number): string | undefined {
    if (activeStoreyIndex === 0) return levelFloors[0]?.id
    for (const floor of levelFloors) {
      const rings = storeyFootprint(document, floor)
      if (rings && pointInsideRings(rings, x, z)) return floor.id
    }
    if (levelFloors.length === 1) return levelFloors[0].id
    if (selectedPlateFloorId && levelFloors.some((floor) => floor.id === selectedPlateFloorId)) {
      return selectedPlateFloorId
    }
    return undefined
  }

  function belowNodes(): { x: number; z: number }[] {
    if (activeStoreyIndex <= 0) return []
    const nodes: { x: number; z: number }[] = []
    for (const floor of levelFloors) {
      const rings = storeyFootprint(document, floor) ?? []
      for (const ring of rings) nodes.push(...ring)
    }
    return nodes
  }

  function finishDraw(endX: number, endZ: number, skin: WallSkin) {
    const floor = activeFloor
    if (!floor || !pendingDraw) return
    const drawFloorId = pendingDraw.startCornerId
      ? floorIdFor(pendingDraw.startCornerId)
      : floorIdForPoint(pendingDraw.startPoint?.x ?? endX, pendingDraw.startPoint?.z ?? endZ)
    if (!drawFloorId) {
      errorMessage = 'Add a storey on that building before drawing here.'
      return
    }
    const pending = pendingDraw
    let cornerUndos = 0
    const rollbackCorners = () => {
      for (let i = 0; i < cornerUndos; i++) documentStore.undo()
      cornerUndos = 0
    }
    let startId = pending.startCornerId
    const start = startCoords(floor, pending)

    if (!start) {
      pendingDraw = null
      return
    }

    const resolved = resolveWallEnd(
      document.plot,
      floor,
      belowNodes(),
      start,
      startId,
      endX,
      endZ,
      highlightedDirection(floor),
    )
    const endCornerHit = resolved.cornerId
      ? floor.corners.find((c) => c.id === resolved.cornerId)
      : undefined
    let endId = endCornerHit?.id
    const endPoint = { x: resolved.x, z: resolved.z }

    if (!startId) {
      const r = documentStore.addCorner(drawFloorId, pending.startPoint!.x, pending.startPoint!.z)
      if (!applyResult(r)) return
      cornerUndos += 1
      const updated = documentStore.document.building.floors.find((f) => f.id === drawFloorId)!
      startId = cornerIdAt(updated, pending.startPoint!.x, pending.startPoint!.z)
      if (!startId) {
        rollbackCorners()
        errorMessage = 'corner not found'
        return
      }
      const movedStart = cornerById(updated.corners, startId)!
      start.x = movedStart.x
      start.z = movedStart.z
    }

    if (!endId) {
      const r = documentStore.addCorner(drawFloorId, endPoint.x, endPoint.z)
      if (!applyResult(r)) {
        rollbackCorners()
        return
      }
      cornerUndos += 1
      const updated = documentStore.document.building.floors.find((f) => f.id === drawFloorId)!
      endId = cornerIdAt(updated, endPoint.x, endPoint.z)
      if (!endId) {
        rollbackCorners()
        errorMessage = 'corner not found'
        return
      }
    }

    const wallResult = documentStore.addWall(drawFloorId, startId, endId, skin)
    if (!applyResult(wallResult)) {
      rollbackCorners()
      return
    }
    const origin = chainOriginId ?? startId
    if (chainOriginId && endId === chainOriginId) {
      pendingDraw = null
      chainOriginId = null
      pointerPlan = null
      return
    }
    chainOriginId = origin
    const placed = documentStore.document.building.floors.find((f) => f.id === drawFloorId)
    const endCorner = placed ? cornerById(placed.corners, endId) : undefined
    pendingDraw = { startCornerId: endId }
    if (endCorner) pointerPlan = { x: endCorner.x, z: endCorner.z }
  }

  function cancelDraw() {
    if (!pendingDraw) return
    pendingDraw = null
    chainOriginId = null
    pointerPlan = null
    errorMessage = null
  }

  function onPlanContextMenu(event: MouseEvent) {
    event.preventDefault()
    cancelDraw()
  }

  function chooseSelection(next: {
    wallId?: string | null
    edge?: number | null
    outline?: { floorId: string | null; ring: number; edge: number } | null
    cornerId?: string | null
    plateFloorId?: string | null
    plateRing?: number | null
  }) {
    selectedWallId = next.wallId ?? null
    selectedEdge = next.edge ?? null
    selectedOutline = next.outline ?? null
    selectedCornerId = next.cornerId ?? null
    selectedPlateFloorId = next.plateFloorId ?? null
    selectedPlateRing = next.plateRing ?? null
  }

  function onSvgPointerDown(event: PointerEvent) {
    if (event.button === 2 || (event.ctrlKey && !event.metaKey)) {
      cancelDraw()
      return
    }
    if (event.button !== 0) return
    const svg = svgEl
    if (!svg || !activeFloor) return
    const plan = clientToPlan(svg, event.clientX, event.clientY)
    if (!plan) return

    if (tool === 'select') {
      if (beginNodeDrag(activeFloor, plan, event)) return
      const id = pickWall(activeFloor, plan.x, plan.z)
      if (id) {
        chooseSelection({ wallId: id })
        applyResult({ ok: true })
        return
      }
      if (pickOutline(plan.x, plan.z)) return
      const room = roomAtPoint(activeFloor, plan.x, plan.z)
      if (room) {
        const next = room.finishId === 'timber' ? 'unfinished' : 'timber'
        applyResult(documentStore.setRoomFinish(floorIdFor(room.cornerIds[0]) ?? activeFloorId, room.cornerIds, next))
        return
      }
      const edge = nearestPlotEdge(plotRing, plan.x, plan.z)
      chooseSelection({ edge: edge ?? null })
      return
    }

    if (tool === 'draw-double' || tool === 'draw-logical') {
      const skin: WallSkin = tool === 'draw-logical' ? 'logical' : 'double'
      if (!pendingDraw) {
      const hit = nearestCorner(activeFloor.corners, plan.x, plan.z)
      const below = hit ? undefined : nearestNode(belowNodes(), plan.x, plan.z)
      const wallHit = hit || below
        ? undefined
        : nearestWallPoint(activeFloor.corners, activeFloor.walls, plan.x, plan.z)
      if (!hit && !below && !wallHit && activeStoreyIndex > 0 && !floorIdForPoint(plan.x, plan.z)) {
          errorMessage = 'Add a storey on that building before drawing here.'
          return
        }
      if (!hit && !below && !wallHit && !pointInPlot(document.plot, plan.x, plan.z)) {
          errorMessage = 'Click inside the plot to start a wall.'
          return
        }
        pendingDraw = hit
          ? { startCornerId: hit.id }
          : { startPoint: { x: below?.x ?? wallHit?.x ?? plan.x, z: below?.z ?? wallHit?.z ?? plan.z } }
        pointerPlan = plan
        errorMessage = null
        return
      }
      finishDraw(plan.x, plan.z, skin)
    }
  }

  function beginNodeDrag(floor: Floor, plan: { x: number; z: number }, event: PointerEvent): boolean {
    const node = nearestCorner(floor.corners, plan.x, plan.z, NODE_HIT_M)
    if (!node || !svgEl) return false
    moveDrag = {
      nodeId: node.id,
      cornerIds: connectedCornerIds(floor, node.id),
      startX: plan.x,
      startZ: plan.z,
      dx: 0,
      dz: 0,
      traces: [],
    }
    svgEl.setPointerCapture(event.pointerId)
    return true
  }

  function onSvgPointerMove(event: PointerEvent) {
    const svg = svgEl
    if (!svg) return
    const plan = clientToPlan(svg, event.clientX, event.clientY)
    pointerPlan = plan
    if (!plan || !activeFloor) return
    if (rotateDrag) {
      const pivot = cornerById(activeFloor.corners, rotateDrag.pivotId)
      if (!pivot) return
      let raw = Math.atan2(plan.z - pivot.z, plan.x - pivot.x) - rotateDrag.originAngle
      while (raw - rotateDrag.angle > Math.PI) raw -= 2 * Math.PI
      while (rotateDrag.angle - raw > Math.PI) raw += 2 * Math.PI
      const snapped = snapTurn(raw)
      if (!rotationStaysInPlot(document.plot, activeFloor, rotateDrag.cornerIds, rotateDrag.pivotId, snapped.angle))
        return
      rotateDrag = { ...rotateDrag, angle: snapped.angle, snapped: snapped.snapped }
      return
    }
    if (!moveDrag) {
      trackNodeHover(activeFloor, plan)
      return
    }
    const drag = moveDrag
    const rawDx = plan.x - drag.startX
    const rawDz = plan.z - drag.startZ
    const movingIds = new Set(drag.cornerIds)
    const moving = activeFloor.corners.filter((corner) => movingIds.has(corner.id))
    const fixed = activeFloor.corners.filter((corner) => !movingIds.has(corner.id))
    const aligned = alignTranslation(rawDx, rawDz, moving, fixed)
    const dx = translationStaysInPlot(document.plot, activeFloor, drag.cornerIds, aligned.dx, aligned.dz)
      ? aligned.dx
      : rawDx
    const dz = translationStaysInPlot(document.plot, activeFloor, drag.cornerIds, aligned.dx, aligned.dz)
      ? aligned.dz
      : rawDz
    const traces = dx === aligned.dx && dz === aligned.dz ? aligned.traces : []
    if (!translationStaysInPlot(document.plot, activeFloor, drag.cornerIds, dx, dz)) return
    moveDrag = { ...drag, dx, dz, traces }
  }

  function onSvgPointerUp(event: PointerEvent) {
    const svg = event.currentTarget
    if (svg instanceof SVGSVGElement && svg.hasPointerCapture(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId)
    }
    const turning = rotateDrag
    if (turning) {
      rotateDrag = null
      const turnDeg = (((turning.angle * 180) / Math.PI) % 360) + 360
      if (turnDeg % 360 < 0.05 || turnDeg % 360 > 359.95) return
      const result = documentStore.rotateCorners(
        floorIdFor(turning.pivotId) ?? activeFloorId,
        turning.cornerIds,
        turning.pivotId,
        turning.angle,
      )
      if (!result.ok) errorMessage = result.reason
      else errorMessage = null
      return
    }
    const drag = moveDrag
    moveDrag = null
    if (!drag || !activeFloor) return
    chooseSelection({ cornerId: drag.nodeId })
    if (drag.dx === 0 && drag.dz === 0) return
    const result = documentStore.moveCorners(
      floorIdFor(drag.nodeId) ?? activeFloorId,
      drag.cornerIds,
      drag.dx,
      drag.dz,
    )
    if (!result.ok) errorMessage = result.reason
    else errorMessage = null
  }

  function trackNodeHover(floor: Floor, plan: { x: number; z: number }) {
    if (tool !== 'select') {
      hoverNodeId = null
      return
    }
    const node = nearestCorner(floor.corners, plan.x, plan.z, NODE_HIT_M)
    if (node && connectedCornerIds(floor, node.id).length > 1) {
      hoverNodeId = node.id
      return
    }
    if (!hoverNodeId) return
    const corner = cornerById(floor.corners, hoverNodeId)
    const keep = Math.hypot(ROTATE_OFFSET_M, ROTATE_OFFSET_M) + ROTATE_HIT_M + 0.2
    if (!corner || Math.hypot(plan.x - corner.x, plan.z - corner.z) > keep) hoverNodeId = null
  }

  function beginRotate(event: PointerEvent) {
    if (!activeFloor || !svgEl || !rotateHandle) return
    event.stopPropagation()
    const plan = clientToPlan(svgEl, event.clientX, event.clientY)
    const pivot = cornerById(activeFloor.corners, rotateHandle.id)
    if (!plan || !pivot) return
    rotateDrag = {
      pivotId: pivot.id,
      cornerIds: connectedCornerIds(activeFloor, pivot.id),
      originAngle: Math.atan2(plan.z - pivot.z, plan.x - pivot.x),
      angle: 0,
      snapped: false,
    }
    chooseSelection({ cornerId: pivot.id })
    svgEl.setPointerCapture(event.pointerId)
  }

  $effect(() => {
    const drawing = pendingDraw
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !drawing) return
      event.preventDefault()
      cancelDraw()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function setTool(next: Tool) {
    tool = next
    pendingDraw = null
    chainOriginId = null
    moveDrag = null
    rotateDrag = null
    hoverNodeId = null
    selectedCornerId = null
  }

  function selectStorey(index: number) {
    activeStoreyIndex = index
    const next = floors.find((floor) => floor.index === index)
    if (next) activeFloorId = next.id
    pendingDraw = null
    selectedWallId = null
    selectedEdge = null
    selectedOutline = null
    selectedCornerId = null
    selectedPlateFloorId = null
    selectedPlateRing = null
    hoverNodeId = null
    rotateDrag = null
  }

  const storeyTarget = $derived(
    storeyAddTarget(levelFloors, selectedCornerId, selectedWallId, selectedPlateFloorId),
  )

  const storeyUnitId = $derived.by(() => {
    const target = storeyTarget
    if (!target) return undefined
    const floor = floors.find((item) => item.id === target.floorId)
    if (!floor) return undefined
    if (floor.unitId) return floor.unitId
    return floor.corners.find((corner) => corner.id === target.cornerId)?.unitId
  })

  const atStoreyLimit = $derived(
    storeyUnitId !== undefined && topStoreyIndex(document, storeyUnitId) + 1 >= MAX_STOREYS,
  )

  const roofFloor = $derived(roofableFloor(floors, selectedPlateFloorId))

  function addRoof() {
    const floor = roofFloor
    if (!floor || floor.roof) return
    applyResult(documentStore.setRoof(floor.id, { pitchDeg: DEFAULT_ROOF_PITCH_DEG, eaves: DEFAULT_ROOF_EAVES }))
  }

  function setRoofPitch(value: number) {
    const floor = roofFloor
    if (!floor?.roof || !Number.isFinite(value)) return
    applyResult(documentStore.setRoof(floor.id, { ...floor.roof, pitchDeg: value }))
  }

  function setRoofEavesMm(value: number) {
    const floor = roofFloor
    if (!floor?.roof || !Number.isFinite(value)) return
    applyResult(documentStore.setRoof(floor.id, { ...floor.roof, eaves: value / 1000 }))
  }

  function removeRoof() {
    const floor = roofFloor
    if (!floor?.roof) return
    applyResult(documentStore.setRoof(floor.id, null))
  }

  function addStorey() {
    const target = storeyTarget
    if (!target) {
      errorMessage = 'Select a closed building first.'
      return
    }
    const before = new Set(document.building.floors.map((floor) => floor.id))
    const result = documentStore.addStorey(target.floorId, target.cornerId)
    if (!applyResult(result)) return
    const added = documentStore.document.building.floors.find((floor) => !before.has(floor.id))
    if (!added) return
    activeStoreyIndex = added.index
    activeFloorId = added.id
    selectedCornerId = null
    selectedWallId = null
    selectedOutline = null
    selectedPlateFloorId = null
    selectedPlateRing = null
  }

  function outlineRings(): { floorId: string | null; ringIndex: number; ring: { x: number; z: number }[] }[] {
    const rings: { floorId: string | null; ringIndex: number; ring: { x: number; z: number }[] }[] = plates.map(
      (plate) => ({ floorId: plate.floorId, ringIndex: plate.index, ring: plate.ring }),
    )
    underlay.forEach((ring, ringIndex) => rings.push({ floorId: null, ringIndex, ring }))
    return rings
  }

  function pickOutline(x: number, z: number): boolean {
    const candidates = outlineRings()
    const hit = nearestRingEdge(
      candidates.map((item) => item.ring),
      x,
      z,
    )
    if (!hit) return false
    const plotEdge = nearestPlotEdge(plotRing, x, z)
    if (plotEdge !== undefined) {
      const a = plotRing[plotEdge]
      const b = plotRing[(plotEdge + 1) % plotRing.length]
      if (a && b && segmentDistance(a[0], a[1], b[0], b[1], x, z) < hit.distance) return false
    }
    const chosen = candidates[hit.ring]
    if (!chosen) return false
    chooseSelection({
      outline: { floorId: chosen.floorId, ring: chosen.ringIndex, edge: hit.edge },
      plateFloorId: chosen.floorId,
      plateRing: chosen.ringIndex,
    })
    return true
  }

  function removeStorey() {
    const unitId = storeyUnitId
    if (!unitId) return
    const result = documentStore.removeTopStorey(unitId)
    if (!applyResult(result)) return
    const top = topStoreyIndex(documentStore.document, unitId)
    if (activeStoreyIndex > top) {
      activeStoreyIndex = top
      const next =
        documentStore.document.building.floors.find((floor) => floor.unitId === unitId && floor.index === top) ??
        documentStore.document.building.floors.find((floor) => floor.index === 0)
      if (next) activeFloorId = next.id
    }
  }

  const outlineReference = $derived.by(() => {
    const sel = selectedOutline
    if (!sel) return null
    const ring =
      sel.floorId === null
        ? underlay[sel.ring]
        : plates.find((plate) => plate.floorId === sel.floorId && plate.index === sel.ring)?.ring
    if (!ring || ring.length < 2) return null
    const a = ring[sel.edge]
    const b = ring[(sel.edge + 1) % ring.length]
    if (!a || !b) return null
    return { ax: a.x, az: a.z, bx: b.x, bz: b.z }
  })

  const outlineClip = $derived.by((): { x: number; z: number }[][] | null => {
    const sel = selectedOutline
    if (!sel || !outlineReference) return null
    if (sel.floorId === null) {
      const ring = underlay[sel.ring]
      return ring && ring.length >= 3 ? [ring] : null
    }
    const rings = plates
      .filter((plate) => plate.floorId === sel.floorId && plate.ring.length >= 3)
      .map((plate) => plate.ring)
    return rings.length > 0 ? rings : null
  })

  function highlightedDirection(floor: Floor): { dx: number; dz: number } | null {
    if (selectedWallId) {
      const wall = floor.walls.find((item) => item.id === selectedWallId)
      if (!wall) return null
      const a = cornerById(floor.corners, wall.startCornerId)
      const b = cornerById(floor.corners, wall.endCornerId)
      if (!a || !b) return null
      const dx = b.x - a.x
      const dz = b.z - a.z
      if (Math.hypot(dx, dz) < 1e-9) return null
      return { dx, dz }
    }
    const outline = outlineReference
    if (outline) {
      const dx = outline.bx - outline.ax
      const dz = outline.bz - outline.az
      if (Math.hypot(dx, dz) < 1e-9) return null
      return { dx, dz }
    }
    if (selectedEdge === null) return null
    const ring = plotRing
    const a = ring[selectedEdge]
    const b = ring[(selectedEdge + 1) % ring.length]
    if (!a || !b) return null
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    if (Math.hypot(dx, dz) < 1e-9) return null
    return { dx, dz }
  }

  const previewLine = $derived.by(() => {
    if (!pendingDraw || !pointerPlan || !activeFloor) return null
    const start = startCoords(activeFloor, pendingDraw)
    if (!start) return null
    const highlighted = highlightedDirection(activeFloor)
    const resolved = resolveWallEnd(
      document.plot,
      activeFloor,
      belowNodes(),
      start,
      pendingDraw.startCornerId,
      pointerPlan.x,
      pointerPlan.z,
      highlighted,
    )
    const dx = resolved.x - start.x
    const dz = resolved.z - start.z
    const length = Math.hypot(dx, dz)
    const allowed =
      length <= 0.05 || segmentAllowedInPlot(document.plot, start.x, start.z, resolved.x, resolved.z)
    return {
      x1: start.x,
      z1: start.z,
      x2: resolved.x,
      z2: resolved.z,
      length,
      allowed,
      cornerId: resolved.cornerId,
      wallSnap: resolved.wallSnap,
      nodeSnap: resolved.nodeSnap,
      minTurn: resolved.minTurn,
      angleSnap: resolved.angleSnap,
      angle: angleReadout(activeFloor, pendingDraw.startCornerId, start, dx, dz, length, highlighted),
      lengthLabel: lengthReadout(start.x, start.z, resolved.x, resolved.z, length),
      traces: resolved.traces,
    }
  })

  const rotateHandle = $derived.by(() => {
    if (tool !== 'select' || !activeFloor || moveDrag) return null
    const id = rotateDrag?.pivotId ?? hoverNodeId ?? selectedCornerId
    if (!id || connectedCornerIds(activeFloor, id).length < 2) return null
    const corner = cornerById(activeFloor.corners, id)
    if (!corner) return null
    const radius = Math.hypot(ROTATE_OFFSET_M, ROTATE_OFFSET_M)
    let x = corner.x + ROTATE_OFFSET_M
    let z = corner.z - ROTATE_OFFSET_M
    if (rotateDrag && rotateDrag.pivotId === id) {
      const a = Math.atan2(-ROTATE_OFFSET_M, ROTATE_OFFSET_M) + rotateDrag.angle
      x = corner.x + Math.cos(a) * radius
      z = corner.z + Math.sin(a) * radius
    }
    return { id, x, z }
  })

  const rotateLabel = $derived.by(() => {
    if (!rotateDrag || !rotateHandle || !activeFloor) return null
    const pivot = cornerById(activeFloor.corners, rotateDrag.pivotId)
    if (!pivot) return null
    const radius = Math.hypot(ROTATE_OFFSET_M, ROTATE_OFFSET_M) + 0.85
    const a = Math.atan2(rotateHandle.z - pivot.z, rotateHandle.x - pivot.x)
    return {
      x: pivot.x + Math.cos(a) * radius,
      z: pivot.z + Math.sin(a) * radius,
      text: `${turnLabel(rotateDrag.angle)}°`,
    }
  })

  const hoveredCorner = $derived.by(() => {
    if (!activeFloor) return undefined
    if (tool === 'select') {
      const id = moveDrag?.nodeId ?? rotateDrag?.pivotId ?? hoverNodeId ?? selectedCornerId
      return id ? activeFloor.corners.find((corner) => corner.id === id) : undefined
    }
    if (!pointerPlan || moveDrag) return undefined
    return nearestCorner(
      activeFloor.corners,
      pointerPlan.x,
      pointerPlan.z,
      CORNER_SNAP_M,
      pendingDraw?.startCornerId,
    )
  })

  const hoveredBelow = $derived.by(() => {
    if (!pointerPlan || activeStoreyIndex <= 0) return undefined
    if (tool !== 'draw-double' && tool !== 'draw-logical') return undefined
    if (hoveredCorner) return undefined
    const start = pendingDraw && activeFloor ? startCoords(activeFloor, pendingDraw) ?? undefined : undefined
    return nearestNode(belowNodes(), pointerPlan.x, pointerPlan.z, CORNER_SNAP_M, start)
  })

  const hoveredWall = $derived.by(() => {
    if (!pointerPlan || !activeFloor || hoveredCorner) return undefined
    if (tool !== 'draw-double' && tool !== 'draw-logical') return undefined
    return nearestWallPoint(
      activeFloor.corners,
      activeFloor.walls,
      pointerPlan.x,
      pointerPlan.z,
      CORNER_SNAP_M,
      pendingDraw?.startCornerId,
    )
  })

  const localGrid = $derived.by(() => {
    if (displayFloor && selectedWallId) {
      const wall = displayFloor.walls.find((item) => item.id === selectedWallId)
      if (!wall) return []
      const a = cornerById(displayFloor.corners, wall.startCornerId)
      const b = cornerById(displayFloor.corners, wall.endCornerId)
      if (!a || !b) return []
      return gridFromSegment(a.x, a.z, b.x, b.z, bounds)
    }
    const outline = outlineReference
    if (outline) return gridFromSegment(outline.ax, outline.az, outline.bx, outline.bz, bounds)
    if (selectedEdge === null) return []
    const ring = plotRing
    const a = ring[selectedEdge]
    const b = ring[(selectedEdge + 1) % ring.length]
    if (!a || !b) return []
    return gridFromSegment(a[0], a[1], b[0], b[1], bounds)
  })

  const snapTraces = $derived(moveDrag?.traces.length ? moveDrag.traces : (previewLine?.traces ?? []))

  const drawHintBody = $derived.by(() => {
    if (tool === 'select') {
      if (rotateDrag) {
        const deg = turnLabel(rotateDrag.angle)
        return rotateDrag.snapped
          ? `Release to turn the building, ${deg}°. Snaps to the angle.`
          : `Release to turn the building, ${deg}°.`
      }
      return moveDrag
        ? 'Release to place the building.'
        : 'Drag a corner to move that building. Drag the rotate handle to turn it. Click a room to toggle timber finish. Click a dashed floor edge for a grid. Add storey lays a floor on the selected building.'
    }
    if (tool !== 'draw-double' && tool !== 'draw-logical') return ''
    if (!previewLine) return 'Click inside the plot to start a wall, then click each corner. Right-click or Escape stops.'
    if (previewLine.length <= 0.05) return 'Click the next corner. Right-click or Escape stops.'
    const angle = previewLine.angle ? `, ${previewLine.angle.label}` : ''
    if (!previewLine.allowed) return `That end leaves the plot. ${previewLine.length.toFixed(2)} m${angle}`
    const snap = previewLine.cornerId
      ? ' Snaps to the corner.'
        : previewLine.nodeSnap
        ? ' Snaps to the node below.'
        : previewLine.wallSnap
        ? ' Snaps to the wall.'
        : previewLine.traces.length
          ? ' Lines up with a corner.'
          : previewLine.angleSnap
          ? ' Snaps to the angle.'
          : previewLine.minTurn
            ? ` Minimum angle is ${MIN_TURN_DEG}°.`
            : ''
    return `Click to place the end, ${previewLine.length.toFixed(2)} m${angle}.${snap} Right-click or Escape stops.`
  })

  const planHint = $derived.by(() => {
    const extra: string[] = []
    if (activeStoreyIndex >= 2) extra.push('Empirical masonry rules stop at two storeys.')
    if (activeStoreyIndex > 0 && unlandedWallIds.size > 0) {
      extra.push('A wall on this storey does not land on a wall below.')
    }
    if (storeyHasLongSolidWall(levelFloors)) {
      extra.push('A straight wall is longer than 8 m and wants a movement joint.')
    }
    const main = drawHintBody
    if (extra.length === 0) return main
    const tail = extra.join(' ')
    return main ? `${main} ${tail}` : tail
  })

  function roomFill(finishId: string): string {
    if (finishId === 'timber') return 'rgba(139, 90, 43, 0.12)'
    return 'rgba(120, 120, 120, 0.08)'
  }
</script>

<div class="root" oncontextmenu={onPlanContextMenu}>
  <div class="bar">
    <div class="tools">
      <button type="button" class:active={tool === 'draw-double'} onclick={() => setTool('draw-double')}>
        Draw wall
      </button>
      <button type="button" class:active={tool === 'draw-logical'} onclick={() => setTool('draw-logical')}>
        Logical wall
      </button>
      <button type="button" class:active={tool === 'select'} onclick={() => setTool('select')}>Select</button>
    </div>
    <div class="floors">
      <button type="button" disabled={!storeyTarget || atStoreyLimit} onclick={addStorey}>Add storey</button>
      {#if storeyUnitId}
        <button type="button" onclick={removeStorey}>Remove storey</button>
      {/if}
      {#if roofFloor}
        {#if roofFloor.roof}
          <label class="roof">
            Pitch
            <input
              type="number"
              min="1"
              max="89"
              step="1"
              value={roofFloor.roof.pitchDeg}
              onchange={(event) => setRoofPitch(Number(event.currentTarget.value))}
            />
            °
          </label>
          <label class="roof">
            Eaves
            <input
              type="number"
              min="0"
              step="10"
              value={Math.round(roofFloor.roof.eaves * 1000)}
              onchange={(event) => setRoofEavesMm(Number(event.currentTarget.value))}
            />
            mm
          </label>
          <button type="button" onclick={removeRoof}>Remove roof</button>
        {:else}
          <button type="button" onclick={addRoof}>Add roof</button>
        {/if}
      {/if}
    </div>
    {#if errorMessage}
      <p class="error">{errorMessage}</p>
    {:else if planHint}
      <p class="hint">{planHint}</p>
    {/if}
  </div>
  <div class="stage">
    <nav class="key" aria-label="Storeys">
      {#each [...storeyIndexes].reverse() as index (index)}
        <button type="button" class:active={index === activeStoreyIndex} onclick={() => selectStorey(index)}>
          {#if floors.some((floor) => floor.index === index && floor.roof)}
            <span class="key-roof"></span>
          {/if}
          {index === 0 ? 'Ground' : index + 1}
        </button>
      {/each}
    </nav>
  <svg
    bind:this={svgEl}
    class="canvas"
    {viewBox}
    preserveAspectRatio="xMidYMid meet"
    onpointerdown={onSvgPointerDown}
    onpointermove={onSvgPointerMove}
    onpointerup={onSvgPointerUp}
    onpointercancel={onSvgPointerUp}
  >
    <defs>
      <clipPath id="plan-plot-clip">
        <polygon points={pointsAttr(plotRing.map(([x, z]) => [x, z] as SvgPoint))} />
      </clipPath>
      {#if outlineClip}
        <clipPath id="plan-storey-clip">
          {#each outlineClip as ring, i (i)}
            <polygon points={pointsAttr(ring.map((point) => [point.x, point.z] as SvgPoint))} />
          {/each}
        </clipPath>
      {/if}
    </defs>
    <rect
      x={bounds.minX}
      y={bounds.minZ}
      width={bounds.maxX - bounds.minX}
      height={bounds.maxZ - bounds.minZ}
      fill="transparent"
      pointer-events="all"
    />
    <polygon
      points={pointsAttr(plotRing.map(([x, z]) => [x, z] as SvgPoint))}
      fill="#e7e5e4"
      stroke="#18181b"
      stroke-width="0.06"
    />
    {#if selectedEdge !== null}
      {@const a = plotRing[selectedEdge]}
      {@const b = plotRing[(selectedEdge + 1) % plotRing.length]}
      {#if a && b}
        <line
          x1={a[0]}
          y1={a[1]}
          x2={b[0]}
          y2={b[1]}
          stroke="#2563eb"
          stroke-width="0.08"
          pointer-events="none"
        />
      {/if}
    {/if}
    {#if localGrid.length > 0 && !outlineReference}
      <g clip-path="url(#plan-plot-clip)" pointer-events="none">
        {#each localGrid as line, i (i)}
          <line
            x1={line.x1}
            y1={line.z1}
            x2={line.x2}
            y2={line.z2}
            stroke="#93c5fd"
            stroke-width="0.012"
          />
        {/each}
      </g>
    {/if}
    {#if snapTraces.length > 0}
      {#each snapTraces as trace, i (i)}
        <line
          x1={trace.x1}
          y1={trace.z1}
          x2={trace.x2}
          y2={trace.z2}
          stroke="#0891b2"
          stroke-width="0.03"
          stroke-dasharray="0.12 0.08"
          pointer-events="none"
        />
      {/each}
    {/if}
    <g clip-path="url(#plan-plot-clip)" pointer-events="none">
      {#if contours.minor}
        <path
          d={contours.minor}
          fill="none"
          stroke="#7c6a58"
          stroke-width="0.016"
          stroke-linecap="round"
        />
      {/if}
      {#if contours.major}
        <path
          d={contours.major}
          fill="none"
          stroke="#3f3428"
          stroke-width="0.032"
          stroke-linecap="round"
        />
      {/if}
    </g>
    {#if displayFloor}
      {#each underlay as ring, i (i)}
        {#if ring.length >= 3}
          <polygon
            points={pointsAttr(ring.map((point) => [point.x, point.z]))}
            fill="none"
            stroke="#a8a29e"
            stroke-width="0.04"
            stroke-dasharray="0.18 0.12"
            pointer-events="none"
          />
        {/if}
      {/each}
      {#each roofDrawings as drawing (drawing.floorId)}
        <g pointer-events="none">
          {#each drawing.plan.footprints as footprint, i (i)}
            <path
              d={`${ringPath(footprint.outer)}${footprint.holes.map((hole) => ringPath(hole)).join('')}`}
              fill="#5e666e"
              fill-opacity="0.28"
              fill-rule="evenodd"
              stroke="#5e666e"
              stroke-width="0.04"
            />
          {/each}
        </g>
      {/each}
      {#each plates as plate (`${plate.floorId}-${plate.index}`)}
        {#if plate.ring.length >= 3}
          <polygon
            points={pointsAttr(plate.ring.map((point) => [point.x, point.z]))}
            fill={plateFill(plate.floorId, plate.index)}
            stroke="#78716c"
            stroke-width="0.045"
            stroke-dasharray="0.16 0.1"
            pointer-events={tool === 'select' ? 'fill' : 'none'}
            onpointerdown={(event) => {
              if (tool !== 'select') return
              event.stopPropagation()
              const plan = svgEl ? clientToPlan(svgEl, event.clientX, event.clientY) : null
              if (plan) {
                const edge = nearestPlotEdge(
                  plate.ring.map((point) => [point.x, point.z] as [number, number]),
                  plan.x,
                  plan.z,
                )
                if (edge !== undefined) {
                  chooseSelection({
                    outline: { floorId: plate.floorId, ring: plate.index, edge },
                    plateFloorId: plate.floorId,
                    plateRing: plate.index,
                  })
                  return
                }
              }
              chooseSelection({ plateFloorId: plate.floorId, plateRing: plate.index })
            }}
          />
        {/if}
      {/each}
      {#each roofDrawings as drawing (`hips-${drawing.floorId}`)}
        <g pointer-events="none">
          {#each drawing.plan.hips as hip, i (i)}
            <line
              x1={hip.a.x}
              y1={hip.a.z}
              x2={hip.b.x}
              y2={hip.b.z}
              stroke="#3d4450"
              stroke-width="0.035"
              stroke-linecap="round"
            />
          {/each}
        </g>
      {/each}
      {#if outlineReference && localGrid.length > 0}
        <g clip-path="url(#plan-storey-clip)" pointer-events="none">
          {#each localGrid as line, i (i)}
            <line
              x1={line.x1}
              y1={line.z1}
              x2={line.x2}
              y2={line.z2}
              stroke="#93c5fd"
              stroke-width="0.012"
            />
          {/each}
        </g>
      {/if}
      {#each rooms as room (room.cornerIds.join(','))}
        {@const pts = roomPolygonPoints(room.cornerIds, displayFloor)}
        {#if pts.length >= 3}
          <polygon
            points={pointsAttr(pts)}
            fill={roomFill(room.finishId)}
            stroke="none"
            pointer-events="none"
          />
        {/if}
      {/each}
      {#each wallPolygons as poly, i (i)}
        <polygon points={pointsAttr(poly)} fill="#333" stroke="none" />
      {/each}
      {#each logicalWalls as wall (wall.id)}
        {@const a = cornerById(displayFloor.corners, wall.startCornerId)}
        {@const b = cornerById(displayFloor.corners, wall.endCornerId)}
        {#if a && b}
          <line
            x1={a.x}
            y1={a.z}
            x2={b.x}
            y2={b.z}
            stroke="#666"
            stroke-width="0.02"
            stroke-dasharray="0.2 0.15"
          />
        {/if}
      {/each}
      {#if showUnlandedWarning}
        {#each displayFloor.walls as wall (wall.id)}
          {#if unlandedWallIds.has(wall.id)}
            {@const a = cornerById(displayFloor.corners, wall.startCornerId)}
            {@const b = cornerById(displayFloor.corners, wall.endCornerId)}
            {#if a && b}
              <line
                x1={a.x}
                y1={a.z}
                x2={b.x}
                y2={b.z}
                stroke="#b91c1c"
                stroke-width="0.06"
                stroke-linecap="round"
                pointer-events="none"
              />
            {/if}
          {/if}
        {/each}
      {/if}
      {#each displayFloor.walls as wall (wall.id)}
        {@const a = cornerById(displayFloor.corners, wall.startCornerId)}
        {@const b = cornerById(displayFloor.corners, wall.endCornerId)}
        {#if a && b}
          <line
            x1={a.x}
            y1={a.z}
            x2={b.x}
            y2={b.z}
            stroke={wall.id === selectedWallId ? '#2563eb' : 'transparent'}
            stroke-width={wall.id === selectedWallId ? 0.08 : 0.14}
            stroke-linecap="round"
            pointer-events={tool === 'select' ? 'stroke' : 'none'}
            onpointerdown={(e) => {
              if (tool !== 'select' || !activeFloor || !svgEl) return
              e.stopPropagation()
              const plan = clientToPlan(svgEl, e.clientX, e.clientY)
              if (plan && beginNodeDrag(activeFloor, plan, e)) return
              chooseSelection({ wallId: wall.id })
              applyResult({ ok: true })
            }}
          />
        {/if}
      {/each}
      {#if outlineReference}
        <line
          x1={outlineReference.ax}
          y1={outlineReference.az}
          x2={outlineReference.bx}
          y2={outlineReference.bz}
          stroke="#2563eb"
          stroke-width="0.08"
          pointer-events="none"
        />
      {/if}
      {#if previewLine}
        <circle
          cx={previewLine.x1}
          cy={previewLine.z1}
          r="0.18"
          fill="#2563eb"
          pointer-events="none"
        />
        <line
          x1={previewLine.x1}
          y1={previewLine.z1}
          x2={previewLine.x2}
          y2={previewLine.z2}
          stroke={previewLine.allowed ? '#2563eb' : '#b91c1c'}
          stroke-width="0.04"
          stroke-dasharray="0.15 0.1"
          pointer-events="none"
        />
        {#if previewLine.angle?.path}
          <path
            d={previewLine.angle.path}
            fill="none"
            stroke="#2563eb"
            stroke-width="0.03"
            pointer-events="none"
          />
        {/if}
        {#if previewLine.angle}
          <text
            x={previewLine.angle.x}
            y={previewLine.angle.z}
            fill="#1d4ed8"
            font-size="0.42"
            text-anchor="middle"
            dominant-baseline="middle"
            pointer-events="none"
          >
            {previewLine.angle.label}
          </text>
        {/if}
        {#if previewLine.lengthLabel}
          <text
            x={previewLine.lengthLabel.x}
            y={previewLine.lengthLabel.z}
            fill="#1d4ed8"
            font-size="0.38"
            text-anchor="middle"
            dominant-baseline="middle"
            pointer-events="none"
            transform={`rotate(${previewLine.lengthLabel.rotate} ${previewLine.lengthLabel.x} ${previewLine.lengthLabel.z})`}
          >
            {previewLine.lengthLabel.text}
          </text>
        {/if}
      {/if}
      {#each displayFloor.corners as corner (corner.id)}
        <circle
          cx={corner.x}
          cy={corner.z}
          r={hoveredCorner?.id === corner.id ? 0.28 : 0.16}
          fill={hoveredCorner?.id === corner.id ? '#2563eb' : '#18181b'}
          pointer-events="none"
        />
      {/each}
      {#if rotateHandle}
        <g class="rotate" transform={`translate(${rotateHandle.x} ${rotateHandle.z})`} onpointerdown={beginRotate}>
          <circle r={ROTATE_HIT_M} fill="#fff" stroke="#2563eb" stroke-width="0.04" />
          <path d={ROTATE_ICON} fill="#2563eb" pointer-events="none" transform="translate(-0.39 -0.39) scale(0.0325)" />
        </g>
      {/if}
      {#if rotateLabel}
        <text
          x={rotateLabel.x}
          y={rotateLabel.z}
          fill="#1d4ed8"
          font-size="0.42"
          text-anchor="middle"
          dominant-baseline="middle"
          pointer-events="none"
        >
          {rotateLabel.text}
        </text>
      {/if}
      {#if previewLine?.wallSnap || previewLine?.nodeSnap}
        <circle
          cx={previewLine.x2}
          cy={previewLine.z2}
          r="0.22"
          fill="none"
          stroke="#2563eb"
          stroke-width="0.045"
          pointer-events="none"
        />
      {:else if hoveredBelow}
        <circle
          cx={hoveredBelow.x}
          cy={hoveredBelow.z}
          r="0.22"
          fill="none"
          stroke="#2563eb"
          stroke-width="0.045"
          pointer-events="none"
        />
      {:else if hoveredWall}
        <circle
          cx={hoveredWall.x}
          cy={hoveredWall.z}
          r="0.22"
          fill="none"
          stroke="#2563eb"
          stroke-width="0.045"
          pointer-events="none"
        />
      {/if}
      {#if (tool === 'draw-double' || tool === 'draw-logical') && pointerPlan}
        <circle
          cx={pointerPlan.x}
          cy={pointerPlan.z}
          r={CORNER_SNAP_M}
          fill="none"
          stroke="#93c5fd"
          stroke-width="0.025"
          pointer-events="none"
        />
      {/if}
    {/if}
  </svg>
  </div>
</div>

<style>
  .root {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    background: #f4f4f5;
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1rem;
    padding: 0.5rem 0.75rem;
    background: #fff;
    border-bottom: 1px solid #e4e4e7;
    font-family: system-ui, sans-serif;
    font-size: 0.875rem;
  }

  .tools,
  .floors {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
  }

  .roof {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .roof input {
    width: 4.5rem;
    font: inherit;
    padding: 0.2rem 0.35rem;
  }

  button {
    padding: 0.35rem 0.65rem;
    border: 1px solid #d4d4d8;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
  }

  button.active {
    border-color: #2563eb;
    background: #eff6ff;
  }

  button:disabled {
    cursor: default;
    opacity: 0.45;
  }

  .error,
  .hint {
    margin: 0;
    flex: 1 1 100%;
  }

  .error {
    color: #b91c1c;
  }

  .hint {
    color: #3f3f46;
  }

  .stage {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .key {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 0.35rem;
    width: 5.75rem;
    flex-shrink: 0;
    padding: 0.75rem 0.5rem;
    background: #fff;
    border-right: 1px solid #e4e4e7;
  }

  .key button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    width: 100%;
  }

  .key-roof {
    width: 0;
    height: 0;
    border-left: 0.45rem solid transparent;
    border-right: 0.45rem solid transparent;
    border-bottom: 0.32rem solid #5e666e;
  }

  .canvas {
    flex: 1;
    width: auto;
    min-width: 0;
    min-height: 0;
    touch-action: none;
    cursor: crosshair;
  }

  .rotate {
    cursor: grab;
  }

</style>
