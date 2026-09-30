<script lang="ts">
  import { fencePosts, fenceSpec } from '../../lib/model/fences'
  import { untrack } from 'svelte'
  import BrickWall from '@lucide/svelte/icons/brick-wall'
  import Footprints from '@lucide/svelte/icons/footprints'
  import Layers from '@lucide/svelte/icons/layers'
  import Minus from '@lucide/svelte/icons/minus'
  import MousePointer2 from '@lucide/svelte/icons/mouse-pointer-2'
  import Plus from '@lucide/svelte/icons/plus'
  import RotateCw from '@lucide/svelte/icons/rotate-cw'
  import SquareDashed from '@lucide/svelte/icons/square-dashed'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import Triangle from '@lucide/svelte/icons/triangle'
  import { Badge } from '$lib/components/ui/badge'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import * as Select from '$lib/components/ui/select'
  import * as ToggleGroup from '$lib/components/ui/toggle-group'
  import { SvelteSet } from 'svelte/reactivity'
  import { contourPlanPaths } from '../../lib/geometry/contours'
  import { masonryReach, roofPlan } from '../../lib/geometry/roof'
  import { storeyHasLongSolidWall } from '../../lib/geometry/limits'
  import { isUnlandedWall } from '../../lib/geometry/support'
  import { connectedCornerIds, groundPad, levelField } from '../../lib/geometry/pad'
  import { solidWallPolygonsForFloor, type SvgPoint } from '../../lib/export/svg'
  import { cornerById } from '../../lib/model/geom'
  import { deriveRooms, roomKey } from '../../lib/model/rooms'
  import {
    cellAt,
    layoutSpaces,
    ringLabelPoint,
    ROOM_TYPES,
    roomTypeLabel,
    type Cell,
  } from '../../lib/geometry/spaces'
  import { FINISH_LABEL } from '../../lib/cost/quantities'
  import { buildingChecks, checksForSpace, FENESTRATION_MAX_RATIO } from '../../lib/geometry/sans'
  import { isHabitable } from '../../lib/geometry/spaces'
  import { MAX_RISER_M, MIN_GOING_M, stairLayout, stairVoids } from '../../lib/geometry/stairs'
  import type { Stair } from '../../lib/model/types'
  import { pointInRing } from '../../lib/geometry/pad'
  import {
    pointInsideRings,
    storeyFootprint,
    storeyUnderlay,
    MAX_STOREYS,
    topStoreyIndex,
    supportingFloor,
  } from '../../lib/model/stories'
  import { COVERINGS, coveringOf, DEFAULT_COVERING } from '../../lib/geometry/coverings'
  import type { RoofCovering } from '../../lib/model/types'
  import type { Floor, FloorFinish, RoofForm, RoomType, Space, WallSkin } from '../../lib/model/types'
  import { DEFAULT_WALL_SYSTEM_ID, wallSystem } from '../../lib/model/systems'
  import { pointInPlot, segmentAllowedInPlot } from '../../lib/model/plot-check'
  import { DEFAULT_ROOF_PITCH_DEG } from '../../lib/plot/fixture'
  import { projectDefaults } from '../../lib/model/defaults'
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
  import { angleReadout, lengthReadout, resolveRectangle, resolveWallEnd } from './draw'
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
  import PlanNavigator from './PlanNavigator.svelte'

  type Tool = 'draw-double' | 'draw-logical' | 'draw-rect' | 'draw-stair' | 'select'

  const drawSystem = $derived(wallSystem(documentStore.document.building.wallSystemId ?? DEFAULT_WALL_SYSTEM_ID))

  const PLOT_MARGIN_M = 2.4
  const ROOF_FORMS: Record<RoofForm, string> = { hip: 'Hip', gable: 'Gable', mono: 'Mono-pitch' }
  const MONO_ROOF_PITCH_DEG = 10

  type PendingDraw = {
    startCornerId?: string
    startPoint?: { x: number; z: number }
  }

  let {
    selectedWallId = $bindable<string | null>(null),
    activeFloorId = $bindable(''),
    storey: activeStoreyIndex = $bindable(0),
    focusSpace = null,
    viewKey = '',
    onStatus,
    onFocus,
  }: {
    selectedWallId?: string | null
    activeFloorId?: string
    storey?: number
    focusSpace?: string | null
    viewKey?: string
    onStatus?: (status: { text: string; error: boolean }) => void
    onFocus?: (wallId: string) => void
  } = $props()

  let tool = $state<Tool>('select')
  let toolBeforeRect = $state<Exclude<Tool, 'draw-rect'>>('select')
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
  let selectedCell = $state<{ floorId: string; x: number; z: number } | null>(null)
  let newRoomType = $state<RoomType>('bedroom')
  let pendingStair = $state<{ floorId: string; x: number; z: number } | null>(null)
  let selectedStair = $state<{ floorId: string; id: string } | null>(null)
  let hoverNodeId = $state<string | null>(null)

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
      const below = supportingFloor(document, floor)
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
      spaces: levelFloors.flatMap((floor) => floor.spaces ?? []),
    }
  })

  $effect(() => {
    const spaceId = focusSpace
    if (!spaceId) return
    const floor = documentStore.document.building.floors.find((item) =>
      (item.spaces ?? []).some((space) => space.id === spaceId),
    )
    const seed = floor?.spaces?.find((space) => space.id === spaceId)?.seeds[0]
    if (!floor || !seed) return
    untrack(() => {
      activeStoreyIndex = floor.index
      chooseSelection({ cell: { floorId: floor.id, x: seed.x, z: seed.z } })
    })
  })

  const levelLayouts = $derived(levelFloors.map((floor) => ({ floorId: floor.id, layout: layoutSpaces(floor) })))

  const spaceByRoom = $derived.by(() => {
    const byRoom: Record<string, Space> = {}
    for (const entry of levelLayouts) {
      for (const resolved of entry.layout.spaces) {
        for (const cell of resolved.cells) byRoom[roomKey(cell.room.cornerIds)] = resolved.space
      }
    }
    return byRoom
  })

  const selectedRoom = $derived.by(() => {
    const pick = selectedCell
    if (!pick) return null
    const entry = levelLayouts.find((item) => item.floorId === pick.floorId)
    if (!entry) return null
    const cells = [...entry.layout.spaces.flatMap((resolved) => resolved.cells), ...entry.layout.loose]
    const cell = cellAt(cells, pick.x, pick.z)
    if (!cell) return null
    const resolved = entry.layout.spaces.find((item) => item.cells.includes(cell)) ?? null
    return { floorId: pick.floorId, cell, resolved }
  })

  const sans = $derived(buildingChecks(document))
  const shortSpaceIds = $derived(new Set(sans.rooms.filter((room) => !room.ok).map((room) => room.spaceId)))
  const selectedChecks = $derived(
    selectedRoom?.resolved ? checksForSpace(sans, selectedRoom.resolved.space.id) : undefined,
  )
  const checkFormat = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 1 })

  const areaFormat = new Intl.NumberFormat('en-ZA', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

  function largestCell(cells: Cell[]): Cell {
    return cells.reduce((best, cell) => (cell.netArea > best.netArea ? cell : best), cells[0])
  }

  function cellFill(cornerIds: string[]): string {
    const space = spaceByRoom[roomKey(cornerIds)]
    const chosen = selectedRoom
    if (chosen && space && chosen.resolved?.space.id === space.id) return 'rgba(37, 99, 235, 0.12)'
    if (chosen && !chosen.resolved && roomKey(chosen.cell.room.cornerIds) === roomKey(cornerIds)) {
      return 'rgba(37, 99, 235, 0.12)'
    }
    if (!space) return 'rgba(120, 120, 120, 0.08)'
    if (space.finish === 'timber') return 'rgba(139, 90, 43, 0.14)'
    if (space.finish === 'tiles') return 'rgba(148, 163, 184, 0.2)'
    if (space.finish === 'carpet') return 'rgba(120, 113, 108, 0.16)'
    if (space.finish === 'vinyl') return 'rgba(163, 163, 143, 0.16)'
    return 'rgba(120, 120, 120, 0.1)'
  }

  function nameSelectedRoom() {
    const chosen = selectedRoom
    const pick = selectedCell
    if (!chosen || !pick) return
    const label = roomTypeLabel(newRoomType)
    const taken = floors.flatMap((floor) => floor.spaces ?? []).filter((space) => space.type === newRoomType).length
    const name = taken === 0 ? label : `${label} ${taken + 1}`
    applyResult(documentStore.nameCell(chosen.floorId, pick.x, pick.z, name, newRoomType))
  }

  function patchSelectedSpace(patch: Partial<Pick<Space, 'name' | 'type' | 'finish'>>) {
    const chosen = selectedRoom
    if (!chosen?.resolved) return
    applyResult(documentStore.updateSpace(chosen.floorId, chosen.resolved.space.id, patch))
  }

  const bounds = $derived(plotBounds(plotRing, PLOT_MARGIN_M))

  let turn = $state(0)
  let zoom = $state(1)
  let centre = $state<{ x: number; y: number } | null>(null)
  let contentEl = $state<SVGGElement | undefined>(undefined)
  let canvasSize = $state({ width: 1, height: 1 })

  const viewMatrix = $derived(`rotate(${turn}) scale(1 -1)`)

  function toScreen(x: number, z: number): { x: number; y: number } {
    const a = (turn * Math.PI) / 180
    const fy = -z
    return { x: x * Math.cos(a) - fy * Math.sin(a), y: x * Math.sin(a) + fy * Math.cos(a) }
  }

  const fitBox = $derived.by(() => {
    const corners = [
      toScreen(bounds.minX, bounds.minZ),
      toScreen(bounds.maxX, bounds.minZ),
      toScreen(bounds.maxX, bounds.maxZ),
      toScreen(bounds.minX, bounds.maxZ),
    ]
    const xs = corners.map((c) => c.x)
    const ys = corners.map((c) => c.y)
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
  })

  const view = $derived.by(() => {
    const aspect = canvasSize.width / Math.max(1, canvasSize.height)
    let w = fitBox.w
    let h = fitBox.h
    if (w / h < aspect) w = h * aspect
    else h = w / aspect
    w /= zoom
    h /= zoom
    const c = centre ?? { x: fitBox.x + fitBox.w / 2, y: fitBox.y + fitBox.h / 2 }
    return { x: c.x - w / 2, y: c.y - h / 2, w, h, c }
  })

  const viewBox = $derived(`${view.x} ${view.y} ${view.w} ${view.h}`)
  const labelSize = $derived((bounds.maxX - bounds.minX) / 52 / zoom)

  const screenAxis = $derived({ dx: Math.cos((turn * Math.PI) / 180), dz: Math.sin((turn * Math.PI) / 180) })

  const MIN_ZOOM = 0.5
  const MAX_ZOOM = 40
  let panning = $state<{ pointerId: number; x: number; y: number; from: { x: number; y: number } } | null>(null)
  let spaceHeld = $state(false)

  $effect(() => {
    const svg = svgEl
    if (!svg) return
    const observer = new ResizeObserver(() => {
      canvasSize = { width: svg.clientWidth || 1, height: svg.clientHeight || 1 }
    })
    observer.observe(svg)
    return () => observer.disconnect()
  })

  $effect(() => {
    const key = viewKey
    if (!key) return
    untrack(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(`floorplan:view:${key}`) ?? 'null')
        if (saved && Number.isFinite(saved.turn) && Number.isFinite(saved.zoom)) {
          turn = saved.turn
          zoom = saved.zoom
          centre = saved.centre ?? null
        }
      } catch {
        return
      }
    })
  })

  $effect(() => {
    const key = viewKey
    const snapshot = JSON.stringify({ turn, zoom, centre })
    if (!key) return
    try {
      localStorage.setItem(`floorplan:view:${key}`, snapshot)
    } catch {
      return
    }
  })

  $effect(() => {
    const down = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (event.code === 'Space') {
        spaceHeld = true
        event.preventDefault()
      }
    }
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') spaceHeld = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  })

  function pixelsToView(): number {
    return view.w / Math.max(1, canvasSize.width)
  }

  function viewPointAt(clientX: number, clientY: number): { x: number; y: number } | null {
    const svg = svgEl
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    return {
      x: view.x + (clientX - rect.left) * pixelsToView(),
      y: view.y + (clientY - rect.top) * pixelsToView(),
    }
  }

  function zoomAt(clientX: number, clientY: number, factor: number) {
    const anchor = viewPointAt(clientX, clientY)
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor))
    if (!anchor || next === zoom) return
    const c = view.c
    centre = { x: anchor.x + (c.x - anchor.x) * (zoom / next), y: anchor.y + (c.y - anchor.y) * (zoom / next) }
    zoom = next
  }

  function zoomBy(factor: number) {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor))
    centre = view.c
    zoom = next
  }

  function fitView() {
    zoom = 1
    centre = null
  }

  function setTurn(next: number) {
    const planCentre = untrack(() => {
      const a = (turn * Math.PI) / 180
      const c = view.c
      return { x: c.x * Math.cos(a) + c.y * Math.sin(a), z: -(-c.x * Math.sin(a) + c.y * Math.cos(a)) }
    })
    turn = ((next % 360) + 360) % 360
    if (centre) centre = toScreen(planCentre.x, planCentre.z)
  }

  function onWheel(event: WheelEvent) {
    event.preventDefault()
    const pinch = event.ctrlKey || event.metaKey
    const notched = event.deltaMode === 1 || (!pinch && event.deltaX === 0 && Math.abs(event.deltaY) >= 50 && Number.isInteger(event.deltaY))
    if (pinch || notched) {
      const raw = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
      const amount = Math.max(-0.5, Math.min(0.5, raw * (pinch ? 0.01 : 0.0015)))
      zoomAt(event.clientX, event.clientY, Math.exp(-amount))
      return
    }
    const k = pixelsToView()
    const c = view.c
    centre = { x: c.x + event.deltaX * k, y: c.y + event.deltaY * k }
  }

  function startPan(event: PointerEvent): boolean {
    if (!(event.button === 1 || (event.button === 0 && spaceHeld))) return false
    event.preventDefault()
    svgEl?.setPointerCapture(event.pointerId)
    panning = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, from: view.c }
    return true
  }

  function movePan(event: PointerEvent): boolean {
    const pan = panning
    if (!pan || pan.pointerId !== event.pointerId) return false
    const k = pixelsToView()
    centre = { x: pan.from.x - (event.clientX - pan.x) * k, y: pan.from.y - (event.clientY - pan.y) * k }
    return true
  }

  function endPan(event: PointerEvent): boolean {
    const pan = panning
    if (!pan || pan.pointerId !== event.pointerId) return false
    panning = null
    if (svgEl?.hasPointerCapture(event.pointerId)) svgEl.releasePointerCapture(event.pointerId)
    return true
  }

  function s(size: number): number {
    return size / zoom
  }

  function dash(on: number, off: number): string {
    return `${on / zoom} ${off / zoom}`
  }

  function readable(angle: number): number {
    let a = ((((angle + 180) % 360) + 360) % 360) - 180
    if (a > 90) a -= 180
    if (a <= -90) a += 180
    return a
  }

  function upright(x: number, z: number, planAngle?: number): string {
    const along = planAngle === undefined ? 0 : readable(turn - planAngle)
    return `translate(${x} ${z}) scale(1 -1) rotate(${-turn}) rotate(${along})`
  }

  const displayFloor = $derived(activeFloor ? previewFloor(activeFloor, rotateDrag, moveDrag) : undefined)
  const wallPolygons = $derived(displayFloor ? solidWallPolygonsForFloor(displayFloor) : [])
  const rooms = $derived(displayFloor ? deriveRooms(displayFloor) : [])
  const logicalWalls = $derived(displayFloor?.walls.filter((w) => w.skin === 'logical') ?? [])
  const unlandedWallIds = $derived.by(() => {
    if (activeStoreyIndex <= 0) return new SvelteSet<string>()
    const ids = new SvelteSet<string>()
    for (const floor of levelFloors) {
      for (const wall of floor.walls) {
        if (isUnlandedWall(document, floor, wall)) ids.add(wall.id)
      }
    }
    return ids
  })
  const showUnlandedWarning = $derived(
    tool === 'select' || tool === 'draw-double' || tool === 'draw-logical' || tool === 'draw-rect',
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
    const ctm = (contentEl ?? svg).getScreenCTM()
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
      drawSystem.moduleLength,
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

    const wallsBefore = new Set(floors.flatMap((item) => item.walls.map((wall) => wall.id)))
    const wallResult = documentStore.addWall(drawFloorId, startId, endId, skin, skin === 'logical' ? undefined : drawSystem.id)
    if (!applyResult(wallResult)) {
      rollbackCorners()
      return
    }
    referenceNewWall(wallResult.document, drawFloorId, wallsBefore, endId)
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

  function referenceNewWall(doc: typeof document, floorId: string, before: Set<string>, cornerId: string) {
    const fresh = doc.building.floors
      .find((item) => item.id === floorId)
      ?.walls.filter((wall) => !before.has(wall.id))
    if (!fresh || fresh.length === 0) return
    const touching = fresh.filter((wall) => wall.startCornerId === cornerId || wall.endCornerId === cornerId)
    chooseSelection({ wallId: (touching.at(-1) ?? fresh.at(-1))!.id })
  }

  function cancelDraw() {
    if (pendingStair) {
      pendingStair = null
      errorMessage = null
      return
    }
    if (!pendingDraw) return
    pendingDraw = null
    chainOriginId = null
    pointerPlan = null
    errorMessage = null
  }

  function onSvgDoubleClick(event: MouseEvent) {
    if (tool !== 'select' || event.button !== 0) return
    const svg = svgEl
    if (!svg || !activeFloor) return
    const plan = clientToPlan(svg, event.clientX, event.clientY)
    if (!plan) return
    const id = pickWall(activeFloor, plan.x, plan.z)
    if (!id) return
    chooseSelection({ wallId: id })
    onFocus?.(id)
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
    cell?: { floorId: string; x: number; z: number } | null
    stair?: { floorId: string; id: string } | null
  }) {
    selectedCell = next.cell ?? null
    selectedStair = next.stair ?? null
    selectedWallId = next.wallId ?? null
    selectedEdge = next.edge ?? null
    selectedOutline = next.outline ?? null
    selectedCornerId = next.cornerId ?? null
    selectedPlateFloorId = next.plateFloorId ?? null
    selectedPlateRing = next.plateRing ?? null
  }

  function onSvgPointerDown(event: PointerEvent) {
    if (startPan(event)) return
    if (event.button === 2 || (event.ctrlKey && !event.metaKey)) {
      cancelDraw()
      return
    }
    if (event.button !== 0) return
    const svg = svgEl
    if (!svg || !activeFloor) return
    const plan = clientToPlan(svg, event.clientX, event.clientY)
    if (!plan) return

    if (event.shiftKey && !pendingDraw) {
      const corner = nearestCorner(activeFloor.corners, plan.x, plan.z, NODE_HIT_M)
      if (corner) {
        armRectangle()
        pendingDraw = { startCornerId: corner.id }
        pointerPlan = plan
        errorMessage = null
        return
      }
      const below = nearestNode(belowNodes(), plan.x, plan.z, NODE_HIT_M)
      if (below) {
        armRectangle()
        pendingDraw = { startPoint: { x: below.x, z: below.z } }
        pointerPlan = plan
        errorMessage = null
        return
      }
    }

    if (tool === 'draw-stair') {
      placeStairPoint(plan)
      return
    }

    if (tool === 'select') {
      if (beginNodeDrag(activeFloor, plan, event)) return
      const id = pickWall(activeFloor, plan.x, plan.z)
      if (id) {
        chooseSelection({ wallId: id })
        applyResult({ ok: true })
        return
      }
      if (pickOutline(plan.x, plan.z)) return
      const stair = stairAt(plan.x, plan.z)
      if (stair) {
        chooseSelection({ stair })
        return
      }
      const room = roomAtPoint(activeFloor, plan.x, plan.z)
      if (room) {
        const floorId = floorIdFor(room.cornerIds[0]) ?? activeFloorId
        const current = selectedRoom?.resolved
        if (event.shiftKey && current && selectedRoom?.floorId === floorId) {
          const inside = current.cells.some((cell) => roomKey(cell.room.cornerIds) === roomKey(room.cornerIds))
          applyResult(
            inside
              ? documentStore.leaveCell(floorId, plan.x, plan.z)
              : documentStore.joinCell(floorId, current.space.id, plan.x, plan.z),
          )
          return
        }
        chooseSelection({ cell: { floorId, x: plan.x, z: plan.z } })
        return
      }
      const edge = nearestPlotEdge(plotRing, plan.x, plan.z)
      chooseSelection({ edge: edge ?? null })
      return
    }

    if (tool === 'draw-double' || tool === 'draw-logical' || tool === 'draw-rect') {
      if (!pendingDraw) {
        beginDraw(activeFloor, plan)
        return
      }
      if (tool === 'draw-rect') finishRectangle(plan.x, plan.z)
      else finishDraw(plan.x, plan.z, tool === 'draw-logical' ? 'logical' : 'double')
    }
  }

  function beginDraw(floor: Floor, plan: { x: number; z: number }) {
    const hit = nearestCorner(floor.corners, plan.x, plan.z, NODE_HIT_M)
    const below = hit ? undefined : nearestNode(belowNodes(), plan.x, plan.z)
    const wallHit = hit || below ? undefined : nearestWallPoint(floor.corners, floor.walls, plan.x, plan.z)
    if (!hit && !below && !wallHit && activeStoreyIndex > 0 && !floorIdForPoint(plan.x, plan.z)) {
      errorMessage = 'Add a storey on that building before drawing here.'
      return
    }
    if (!hit && !below && !wallHit && !pointInPlot(document.plot, plan.x, plan.z)) {
      errorMessage =
        tool === 'draw-rect' ? 'Click inside the plot to start a rectangle.' : 'Click inside the plot to start a wall.'
      return
    }
    pendingDraw = hit
      ? { startCornerId: hit.id }
      : { startPoint: { x: below?.x ?? wallHit?.x ?? plan.x, z: below?.z ?? wallHit?.z ?? plan.z } }
    pointerPlan = plan
    errorMessage = null
  }

  function finishRectangle(endX: number, endZ: number) {
    const floor = activeFloor
    if (!floor || !pendingDraw) return
    const start = startCoords(floor, pendingDraw)
    if (!start) {
      pendingDraw = null
      return
    }
    const drawFloorId = pendingDraw.startCornerId
      ? floorIdFor(pendingDraw.startCornerId)
      : floorIdForPoint(start.x, start.z)
    if (!drawFloorId) {
      errorMessage = 'Add a storey on that building before drawing here.'
      return
    }
    const rect = resolveRectangle(
      document.plot,
      floor,
      belowNodes(),
      start,
      pendingDraw.startCornerId,
      endX,
      endZ,
      highlightedDirection(floor),
      drawSystem.moduleLength,
    )
    if (!rect) return
    if (!rect.allowed) {
      errorMessage = 'That rectangle leaves the plot.'
      return
    }
    const wallsBefore = new Set(floors.flatMap((item) => item.walls.map((wall) => wall.id)))
    const result = documentStore.addWallRing(
      drawFloorId,
      rect.corners.map((corner, index) => ({ ...corner, cornerId: rect.cornerIds[index] })),
      'double',
      drawSystem.id,
    )
    if (!applyResult(result)) return
    referenceNewWall(result.document, drawFloorId, wallsBefore, '')
    pendingDraw = null
    chainOriginId = null
    pointerPlan = null
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
    if (movePan(event)) return
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
    if (endPan(event)) return
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

  function typingTarget(event: Event): boolean {
    const target = event.target
    if (!(target instanceof HTMLElement)) return false
    const tag = target.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
  }

  function armRectangle() {
    if (tool === 'draw-rect') return
    toolBeforeRect = tool
    tool = 'draw-rect'
    moveDrag = null
    rotateDrag = null
  }

  function toggleRectangle() {
    if (tool === 'draw-rect') tool = toolBeforeRect
    else armRectangle()
  }

  function onShiftKey(event: KeyboardEvent) {
    if (event.key !== 'Shift' || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
    if (typingTarget(event)) return
    toggleRectangle()
  }

  $effect(() => {
    window.addEventListener('keydown', onShiftKey)
    return () => window.removeEventListener('keydown', onShiftKey)
  })

  function setTool(next: Tool) {
    tool = next
    pendingStair = null
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
    const defaults = projectDefaults(documentStore.document)
    applyResult(
      documentStore.setRoof(floor.id, {
        pitchDeg: defaults.roofPitchDeg,
        eaves: defaults.roofEaves,
        form: defaults.roofForm,
        covering: defaults.roofCovering,
      }),
    )
  }

  function setRoofForm(form: RoofForm) {
    const floor = roofFloor
    if (!floor?.roof) return
    const current = floor.roof
    const pitchDeg =
      form === 'mono' ? MONO_ROOF_PITCH_DEG : (current.form ?? 'hip') === 'mono' ? DEFAULT_ROOF_PITCH_DEG : current.pitchDeg
    applyResult(documentStore.setRoof(floor.id, { ...current, form, turns: 0, pitchDeg }))
  }

  function turnRoof() {
    const floor = roofFloor
    if (!floor?.roof) return
    const limit = floor.roof.form === 'gable' ? 2 : 4
    applyResult(documentStore.setRoof(floor.id, { ...floor.roof, turns: ((floor.roof.turns ?? 0) + 1) % limit }))
  }

  function setRoofCovering(covering: RoofCovering) {
    const floor = roofFloor
    if (!floor?.roof) return
    applyResult(documentStore.setRoof(floor.id, { ...floor.roof, covering }))
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
    if (selectedEdge === null) return turn === 0 ? null : screenAxis
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
    if (tool === 'draw-rect' || !pendingDraw || !pointerPlan || !activeFloor) return null
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
      drawSystem.moduleLength,
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

  const rectanglePreview = $derived.by(() => {
    if (tool !== 'draw-rect' || !pendingDraw || !pointerPlan || !activeFloor) return null
    const start = startCoords(activeFloor, pendingDraw)
    if (!start) return null
    const rect = resolveRectangle(
      document.plot,
      activeFloor,
      belowNodes(),
      start,
      pendingDraw.startCornerId,
      pointerPlan.x,
      pointerPlan.z,
      highlightedDirection(activeFloor),
      drawSystem.moduleLength,
    )
    if (!rect) return null
    const width = lengthReadout(rect.corners[0].x, rect.corners[0].z, rect.corners[1].x, rect.corners[1].z, rect.width)
    const depth = lengthReadout(rect.corners[0].x, rect.corners[0].z, rect.corners[3].x, rect.corners[3].z, rect.depth)
    return { ...rect, widthLabel: width, depthLabel: depth }
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
      NODE_HIT_M,
      pendingDraw?.startCornerId,
    )
  })

  const hoveredBelow = $derived.by(() => {
    if (!pointerPlan || activeStoreyIndex <= 0) return undefined
    if (tool !== 'draw-double' && tool !== 'draw-logical' && tool !== 'draw-rect') return undefined
    if (hoveredCorner) return undefined
    const start = pendingDraw && activeFloor ? startCoords(activeFloor, pendingDraw) ?? undefined : undefined
    return nearestNode(belowNodes(), pointerPlan.x, pointerPlan.z, CORNER_SNAP_M, start)
  })

  const hoveredWall = $derived.by(() => {
    if (!pointerPlan || !activeFloor || hoveredCorner) return undefined
    if (tool !== 'draw-double' && tool !== 'draw-logical' && tool !== 'draw-rect') return undefined
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
    if (selectedEdge !== null) {
      const ring = plotRing
      const a = ring[selectedEdge]
      const b = ring[(selectedEdge + 1) % ring.length]
      if (a && b) return gridFromSegment(a[0], a[1], b[0], b[1], bounds)
    }
    return gridFromSegment(0, 0, screenAxis.dx, screenAxis.dz, bounds)
  })

  const compassAligned = $derived(
    selectedWallId === null && selectedOutline === null && selectedEdge === null,
  )

  function squareToSelectedWall() {
    const floor = activeFloor
    const wall = floor?.walls.find((item) => item.id === selectedWallId)
    const a = wall && floor ? cornerById(floor.corners, wall.startCornerId) : undefined
    const b = wall && floor ? cornerById(floor.corners, wall.endCornerId) : undefined
    if (!a || !b) return
    const along = (Math.atan2(b.z - a.z, b.x - a.x) * 180) / Math.PI
    const options = [along, along + 180, along - 180, along + 360]
    setTurn(options.reduce((best, item) => (Math.abs(item - turn) < Math.abs(best - turn) ? item : best)))
  }

  const snapTraces = $derived(
    moveDrag?.traces.length ? moveDrag.traces : (rectanglePreview?.traces ?? previewLine?.traces ?? []),
  )

  const levelStairs = $derived(
    levelFloors.flatMap((floor) =>
      (floor.stairs ?? []).map((stair) => ({ floorId: floor.id, stair, layout: stairLayout(stair, floor.index) })),
    ),
  )
  const levelVoids = $derived(levelFloors.flatMap((floor) => stairVoids(document, floor)))

  const chosenStair = $derived.by(() => {
    const pick = selectedStair
    if (!pick) return null
    return levelStairs.find((item) => item.stair.id === pick.id) ?? null
  })

  function stairAt(x: number, z: number): { floorId: string; id: string } | null {
    const hit = levelStairs.find((item) => pointInRing(item.layout.footprint, x, z))
    return hit ? { floorId: hit.floorId, id: hit.stair.id } : null
  }

  function stairDirection(floor: Floor, from: { x: number; z: number }, to: { x: number; z: number }) {
    const grid = highlightedDirection(floor)
    const length = grid ? Math.hypot(grid.dx, grid.dz) : 0
    const u = grid && length > 1e-9 ? { x: grid.dx / length, z: grid.dz / length } : { x: 1, z: 0 }
    const candidates = [u, { x: -u.x, z: -u.z }, { x: -u.z, z: u.x }, { x: u.z, z: -u.x }]
    const dx = to.x - from.x
    const dz = to.z - from.z
    return candidates.reduce((best, item) => (item.x * dx + item.z * dz > best.x * dx + best.z * dz ? item : best))
  }

  const stairPreview = $derived.by(() => {
    const pending = pendingStair
    const pointer = pointerPlan
    if (tool !== 'draw-stair' || !pending || !pointer || !activeFloor) return null
    if (Math.hypot(pointer.x - pending.x, pointer.z - pending.z) < 0.2) return null
    const floor = floors.find((item) => item.id === pending.floorId)
    if (!floor) return null
    const dir = stairDirection(activeFloor, pending, pointer)
    const stair: Stair = { id: 'preview', x: pending.x, z: pending.z, dx: dir.x, dz: dir.z, width: 0.9 }
    return { stair, layout: stairLayout(stair, floor.index) }
  })

  function placeStairPoint(plan: { x: number; z: number }) {
    if (!activeFloor) return
    const pending = pendingStair
    if (!pending) {
      const floorId = floorIdForPoint(plan.x, plan.z)
      if (!floorId) {
        errorMessage = 'Click inside a room to start the stair.'
        return
      }
      pendingStair = { floorId, x: plan.x, z: plan.z }
      errorMessage = null
      return
    }
    const preview = stairPreview
    if (!preview) return
    const result = documentStore.addStair(pending.floorId, pending.x, pending.z, preview.stair.dx, preview.stair.dz)
    if (!applyResult(result)) return
    pendingStair = null
    const placed = result.document.building.floors.find((floor) => floor.id === pending.floorId)?.stairs?.at(-1)
    setTool('select')
    if (placed) chooseSelection({ stair: { floorId: pending.floorId, id: placed.id } })
  }

  function patchChosenStair(patch: Partial<Pick<Stair, 'width' | 'x' | 'z' | 'dx' | 'dz'>>) {
    const chosen = chosenStair
    if (!chosen) return
    applyResult(documentStore.updateStair(chosen.floorId, chosen.stair.id, patch))
  }

  function turnChosenStair() {
    const chosen = chosenStair
    if (!chosen) return
    const { stair, layout } = chosen
    patchChosenStair({
      x: stair.x + stair.dx * layout.length,
      z: stair.z + stair.dz * layout.length,
      dx: -stair.dx,
      dz: -stair.dz,
    })
  }

  function removeChosenStair() {
    const chosen = chosenStair
    if (!chosen) return
    if (applyResult(documentStore.removeStair(chosen.floorId, chosen.stair.id))) chooseSelection({})
  }

  const deletable = $derived.by((): { label: string; run: () => void } | null => {
    if (roofFloor) return null
    if (chosenStair) return { label: 'Delete stair', run: removeChosenStair }
    const wallId = selectedWallId
    const floor = activeFloor
    const wall = wallId ? floor?.walls.find((item) => item.id === wallId) : undefined
    if (!floor || !wall) return null
    return {
      label: wall.skin === 'logical' ? (wall.fence ? 'Delete fence line' : 'Delete logical wall') : 'Delete wall',
      run: () => {
        if (applyResult(documentStore.removeWall(floor.id, wall.id))) chooseSelection({})
      },
    }
  })

  $effect(() => {
    const action = deletable
    if (!action) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      if (event.metaKey || event.ctrlKey || event.altKey || typingTarget(event)) return
      if (event.target instanceof HTMLElement && event.target.closest('[role="listbox"], [role="menu"], select')) return
      event.preventDefault()
      action.run()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const drawHintBody = $derived.by(() => {
    if (tool === 'draw-stair') {
      if (!pendingStair) return 'Click where the bottom step starts. A stair needs a storey above it.'
      return 'Click the direction the stair climbs.'
    }
    if (tool === 'select') {
      if (rotateDrag) {
        const deg = turnLabel(rotateDrag.angle)
        return rotateDrag.snapped ? `${deg}°. Snaps to the angle.` : `${deg}°.`
      }
      return moveDrag ? 'Release to place the building.' : ''
    }
    if (tool === 'draw-rect') {
      if (!pendingDraw) return 'Click two corners. Shift leaves the rectangle.'
      if (!rectanglePreview) return 'Click the opposite corner.'
      const size = `${rectanglePreview.width.toFixed(2)} m by ${rectanglePreview.depth.toFixed(2)} m`
      if (!rectanglePreview.allowed) return `That rectangle leaves the plot. ${size}`
      const snap =
        rectanglePreview.snap === 'corner'
          ? ' Snaps to the corner.'
          : rectanglePreview.snap === 'node'
            ? ' Snaps to the node below.'
            : rectanglePreview.snap === 'wall'
              ? ' Snaps to the wall.'
              : rectanglePreview.snap === 'align'
                ? ' Lines up with a corner.'
                : ''
      return `${size}.${snap}`
    }
    if (tool !== 'draw-double' && tool !== 'draw-logical') return ''
    if (!previewLine) {
      return tool === 'draw-logical'
        ? 'Click each corner of a logical wall.'
        : 'Click each corner. Shift draws a rectangle.'
    }
    if (previewLine.length <= 0.05) return 'Click the next corner.'
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
    return `${previewLine.length.toFixed(2)} m${angle}.${snap}`
  })

  const planHint = $derived.by(() => {
    if (drawHintBody) return drawHintBody
    if (activeStoreyIndex > 0 && unlandedWallIds.size > 0) {
      return 'A wall on this storey does not land on a wall below.'
    }
    if (storeyHasLongSolidWall(levelFloors)) {
      return 'A straight wall is longer than 8 m and wants a movement joint.'
    }
    if (activeStoreyIndex >= 2) return 'Empirical masonry rules stop at two storeys.'
    if (sans.fenestration && !sans.fenestration.ok) {
      const share = Math.round(sans.fenestration.ratio * 100)
      const limit = Math.round(FENESTRATION_MAX_RATIO * 100)
      return `Glazing is ${share}% of the floor area. Above ${limit}%, SANS 10400-XA wants a fenestration calculation.`
    }
    if (shortSpaceIds.size > 0) {
      const count = shortSpaceIds.size
      return `${count} ${count === 1 ? 'room falls' : 'rooms fall'} short of SANS 10400 checks. Select one to see why.`
    }
    return ''
  })

  $effect(() => {
    onStatus?.({ text: errorMessage ?? planHint, error: errorMessage !== null })
    return () => onStatus?.({ text: '', error: false })
  })

</script>

<div class="root" oncontextmenu={onPlanContextMenu}>
  <div class="flex flex-wrap items-center gap-2 border-b bg-background px-2 py-1.5 sm:gap-3 sm:px-3">
    <ToggleGroup.Root
      type="single"
      variant="outline"
      size="sm"
      value={tool === 'draw-rect' ? 'draw-double' : tool}
      onValueChange={(next) => {
        if (next) setTool(next as Tool)
      }}
      aria-label="Tool"
    >
      <ToggleGroup.Item value="select" aria-label="Select" title="Select (V)" class="max-sm:px-2">
        <MousePointer2 /><span class="hidden sm:inline">Select</span>
      </ToggleGroup.Item>
      <ToggleGroup.Item value="draw-double" aria-label="Wall" title="Wall. Hold Shift to draw a rectangle." class="max-sm:px-2">
        <BrickWall /><span class="hidden sm:inline">Wall</span>
      </ToggleGroup.Item>
      <ToggleGroup.Item value="draw-logical" aria-label="Logical wall" title="Logical wall: divides a room without building anything" class="max-sm:px-2">
        <SquareDashed /><span class="hidden sm:inline">Logical</span>
      </ToggleGroup.Item>
      <ToggleGroup.Item value="draw-stair" aria-label="Stair" title="Stair" class="max-sm:px-2">
        <Footprints /><span class="hidden sm:inline">Stair</span>
      </ToggleGroup.Item>
    </ToggleGroup.Root>
    {#if deletable}
      <Button
        variant="ghost"
        size="sm"
        class="ml-auto text-destructive hover:text-destructive"
        title="{deletable.label} (Delete or Backspace)"
        onclick={deletable.run}
      >
        <Trash2 />{deletable.label}
        <kbd class="ml-1 hidden rounded border px-1 font-sans text-[10px] text-muted-foreground sm:inline">⌫</kbd>
      </Button>
    {/if}
  </div>
  <div class="stage">
    <nav class="key" aria-label="Storeys">
      <Button
        variant="outline"
        size="sm"
        class="shrink-0"
        disabled={!storeyTarget || atStoreyLimit}
        title={!storeyTarget
          ? 'Select a closed building first.'
          : atStoreyLimit
            ? 'Four storeys is the limit.'
            : 'Lay a floor on the selected building.'}
        onclick={addStorey}
      >
        <Plus />Storey
      </Button>
      {#if storeyUnitId}
        <Button variant="ghost" size="sm" class="shrink-0 text-muted-foreground" onclick={removeStorey}>
          <Minus />Remove
        </Button>
      {/if}
      <div class="flex gap-1 max-md:border-l max-md:pl-2 md:mt-1 md:flex-col md:border-t md:pt-2">
        {#each [...storeyIndexes].reverse() as index (index)}
          <Button
            variant={index === activeStoreyIndex ? 'secondary' : 'ghost'}
            size="sm"
            class="shrink-0 justify-start"
            aria-current={index === activeStoreyIndex ? 'true' : undefined}
            onclick={() => selectStorey(index)}
          >
            {#if floors.some((floor) => floor.index === index && floor.roof)}
              <Triangle class="text-muted-foreground" />
            {:else}
              <Layers class="text-muted-foreground" />
            {/if}
            {index === 0 ? 'Ground' : `Storey ${index + 1}`}
          </Button>
        {/each}
      </div>
    </nav>
  <div
    class="pointer-events-none absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 z-10 origin-bottom-left scale-90 md:left-[9.25rem] md:scale-100 {chosenStair ||
    selectedRoom ||
    roofFloor
      ? 'max-md:hidden'
      : ''}"
  >
    <PlanNavigator
      {turn}
      bearing={document.plot.northBearingDeg}
      {zoom}
      aligned={compassAligned}
      canSquare={selectedWallId !== null}
      onTurn={setTurn}
      onSquare={squareToSelectedWall}
      onZoomIn={() => zoomBy(1.4)}
      onZoomOut={() => zoomBy(1 / 1.4)}
      onFit={fitView}
      onClearReference={() => chooseSelection({})}
    />
  </div>
  <svg
    bind:this={svgEl}
    class="canvas"
    class:panning={spaceHeld || panning !== null}
    {viewBox}
    preserveAspectRatio="xMidYMid meet"
    onpointerdown={onSvgPointerDown}
    onpointermove={onSvgPointerMove}
    onpointerup={onSvgPointerUp}
    onpointercancel={onSvgPointerUp}
    ondblclick={onSvgDoubleClick}
    onwheel={onWheel}
    onauxclick={(event) => event.preventDefault()}
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
    <g bind:this={contentEl} transform={viewMatrix}>
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
      stroke-width={s(0.06)}
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
          stroke-width={s(0.08)}
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
            stroke-width={s(0.012)}
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
          stroke-width={s(0.03)}
          stroke-dasharray={dash(0.12, 0.08)}
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
          stroke-width={s(0.016)}
          stroke-linecap="round"
        />
      {/if}
      {#if contours.major}
        <path
          d={contours.major}
          fill="none"
          stroke="#3f3428"
          stroke-width={s(0.032)}
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
            stroke-width={s(0.04)}
            stroke-dasharray={dash(0.18, 0.12)}
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
              stroke-width={s(0.04)}
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
            stroke-width={s(0.045)}
            stroke-dasharray={dash(0.16, 0.1)}
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
              stroke-width={s(0.035)}
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
              stroke-width={s(0.012)}
            />
          {/each}
        </g>
      {/if}
      {#each rooms as room (room.cornerIds.join(','))}
        {@const pts = roomPolygonPoints(room.cornerIds, displayFloor)}
        {#if pts.length >= 3}
          <polygon
            points={pointsAttr(pts)}
            fill={cellFill(room.cornerIds)}
            stroke="none"
            pointer-events="none"
          />
        {/if}
      {/each}
      {#each wallPolygons as poly, i (i)}
        <polygon points={pointsAttr(poly)} fill="#333" stroke="none" />
      {/each}
      <g class="stairs" pointer-events="none">
        {#each levelVoids as ring, i (i)}
          <polygon points={pointsAttr(ring.map((p) => [p.x, p.z] as SvgPoint))} class="stair-void" />
        {/each}
        {#each levelStairs as item (item.stair.id)}
          {@const top = {
            x: item.stair.x + item.stair.dx * item.layout.length,
            z: item.stair.z + item.stair.dz * item.layout.length,
          }}
          <polygon
            points={pointsAttr(item.layout.footprint.map((p) => [p.x, p.z] as SvgPoint))}
            class="stair-flight"
            class:chosen={selectedStair?.id === item.stair.id}
          />
          {#each item.layout.nosings as line, i (i)}
            <line x1={line.a.x} y1={line.a.z} x2={line.b.x} y2={line.b.z} class="stair-nosing" />
          {/each}
          <line x1={item.stair.x} y1={item.stair.z} x2={top.x} y2={top.z} class="stair-arrow" />
          <polygon
            points={pointsAttr([
              [top.x, top.z],
              [top.x - item.stair.dx * 0.3 - item.stair.dz * 0.14, top.z - item.stair.dz * 0.3 + item.stair.dx * 0.14],
              [top.x - item.stair.dx * 0.3 + item.stair.dz * 0.14, top.z - item.stair.dz * 0.3 - item.stair.dx * 0.14],
            ])}
            class="stair-foot"
          />
          <circle cx={item.stair.x} cy={item.stair.z} r={s(0.08)} class="stair-foot" />
        {/each}
        {#if stairPreview}
          <polygon
            points={pointsAttr(stairPreview.layout.footprint.map((p) => [p.x, p.z] as SvgPoint))}
            class="stair-flight preview"
          />
          {#each stairPreview.layout.nosings as line, i (i)}
            <line x1={line.a.x} y1={line.a.z} x2={line.b.x} y2={line.b.z} class="stair-nosing" />
          {/each}
        {/if}
      </g>
      <g class="room-labels" pointer-events="none">
        {#each levelLayouts as entry (entry.floorId)}
          {#each entry.layout.spaces as resolved (resolved.space.id)}
            {@const at = ringLabelPoint(largestCell(resolved.cells).net)}
            <text
              transform={upright(at.x, at.z)}
              y={-labelSize * 0.35}
              font-size={labelSize}
              text-anchor="middle"
              class="room-name"
              class:short={shortSpaceIds.has(resolved.space.id)}
            >
              {resolved.space.name}
            </text>
            <text
              transform={upright(at.x, at.z)}
              y={labelSize * 0.8}
              font-size={labelSize * 0.8}
              text-anchor="middle"
              class="room-area"
              class:short={shortSpaceIds.has(resolved.space.id)}
            >
              {areaFormat.format(resolved.area)} m²{shortSpaceIds.has(resolved.space.id) ? ' · check' : ''}
            </text>
          {/each}
          {#each entry.layout.loose as cell (roomKey(cell.room.cornerIds))}
            {@const at = ringLabelPoint(cell.net)}
            <text transform={upright(at.x, at.z)} y={labelSize * 0.3} font-size={labelSize * 0.8} text-anchor="middle" class="room-area">
              {areaFormat.format(cell.netArea)} m²
            </text>
          {/each}
        {/each}
      </g>
      {#each logicalWalls as wall (wall.id)}
        {@const a = cornerById(displayFloor.corners, wall.startCornerId)}
        {@const b = cornerById(displayFloor.corners, wall.endCornerId)}
        {#if a && b}
          {#if wall.fence}
            {@const spec = fenceSpec(wall.fence.type)}
            {@const length = Math.hypot(b.x - a.x, b.z - a.z)}
            <line x1={a.x} y1={a.z} x2={b.x} y2={b.z} stroke={spec.colour} stroke-width={Math.max(s(0.025), 0.03)} />
            {#each fencePosts(length, spec) as u (u)}
              {@const t = length > 0 ? u / length : 0}
              <rect
                x={a.x + (b.x - a.x) * t - spec.postSize / 2}
                y={a.z + (b.z - a.z) * t - spec.postSize / 2}
                width={spec.postSize}
                height={spec.postSize}
                fill={spec.colour}
              />
            {/each}
          {:else}
            <line
              x1={a.x}
              y1={a.z}
              x2={b.x}
              y2={b.z}
              stroke="#666"
              stroke-width={s(0.02)}
              stroke-dasharray={dash(0.2, 0.15)}
            />
          {/if}
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
                stroke-width={s(0.06)}
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
            stroke-width={s(wall.id === selectedWallId ? 0.08 : 0.14)}
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
          stroke-width={s(0.08)}
          pointer-events="none"
        />
      {/if}
      {#if rectanglePreview}
        {#each rectanglePreview.corners as corner, i (i)}
          {@const next = rectanglePreview.corners[(i + 1) % rectanglePreview.corners.length]}
          <line
            x1={corner.x}
            y1={corner.z}
            x2={next.x}
            y2={next.z}
            stroke={rectanglePreview.allowed ? '#2563eb' : '#b91c1c'}
            stroke-width={s(0.04)}
            stroke-dasharray={dash(0.15, 0.1)}
            pointer-events="none"
          />
        {/each}
        {#if rectanglePreview.widthLabel}
          <text
            transform={upright(rectanglePreview.widthLabel.x, rectanglePreview.widthLabel.z, rectanglePreview.widthLabel.rotate)}
            fill="#1d4ed8"
            font-size={s(0.38)}
            text-anchor="middle"
            dominant-baseline="middle"
            pointer-events="none"
          >
            {rectanglePreview.widthLabel.text}
          </text>
        {/if}
        {#if rectanglePreview.depthLabel}
          <text
            transform={upright(rectanglePreview.depthLabel.x, rectanglePreview.depthLabel.z, rectanglePreview.depthLabel.rotate)}
            fill="#1d4ed8"
            font-size={s(0.38)}
            text-anchor="middle"
            dominant-baseline="middle"
            pointer-events="none"
          >
            {rectanglePreview.depthLabel.text}
          </text>
        {/if}
      {/if}
      {#if previewLine}
        <circle
          cx={previewLine.x1}
          cy={previewLine.z1}
          r={s(0.18)}
          fill="#2563eb"
          pointer-events="none"
        />
        <line
          x1={previewLine.x1}
          y1={previewLine.z1}
          x2={previewLine.x2}
          y2={previewLine.z2}
          stroke={previewLine.allowed ? '#2563eb' : '#b91c1c'}
          stroke-width={s(0.04)}
          stroke-dasharray={dash(0.15, 0.1)}
          pointer-events="none"
        />
        {#if previewLine.angle?.path}
          <path
            d={previewLine.angle.path}
            fill="none"
            stroke="#2563eb"
            stroke-width={s(0.03)}
            pointer-events="none"
          />
        {/if}
        {#if previewLine.angle}
          <text
            transform={upright(previewLine.angle.x, previewLine.angle.z)}
            fill="#1d4ed8"
            font-size={s(0.42)}
            text-anchor="middle"
            dominant-baseline="middle"
            pointer-events="none"
          >
            {previewLine.angle.label}
          </text>
        {/if}
        {#if previewLine.lengthLabel}
          <text
            transform={upright(previewLine.lengthLabel.x, previewLine.lengthLabel.z, previewLine.lengthLabel.rotate)}
            fill="#1d4ed8"
            font-size={s(0.38)}
            text-anchor="middle"
            dominant-baseline="middle"
            pointer-events="none"
          >
            {previewLine.lengthLabel.text}
          </text>
        {/if}
      {/if}
      {#each displayFloor.corners as corner (corner.id)}
        <circle
          cx={corner.x}
          cy={corner.z}
          r={s(hoveredCorner?.id === corner.id ? 0.28 : 0.16)}
          fill={hoveredCorner?.id === corner.id ? '#2563eb' : '#18181b'}
          pointer-events="none"
        />
      {/each}
      {#if rotateHandle}
        <g class="rotate" transform={`translate(${rotateHandle.x} ${rotateHandle.z})`} onpointerdown={beginRotate}>
          <circle r={ROTATE_HIT_M} fill="#fff" stroke="#2563eb" stroke-width={s(0.04)} />
          <path d={ROTATE_ICON} fill="#2563eb" pointer-events="none" transform="translate(-0.39 -0.39) scale(0.0325)" />
        </g>
      {/if}
      {#if rotateLabel}
        <text
          transform={upright(rotateLabel.x, rotateLabel.z)}
          fill="#1d4ed8"
          font-size={s(0.42)}
          text-anchor="middle"
          dominant-baseline="middle"
          pointer-events="none"
        >
          {rotateLabel.text}
        </text>
      {/if}
      {#if rectanglePreview?.snap === 'corner' || rectanglePreview?.snap === 'node' || rectanglePreview?.snap === 'wall'}
        <circle
          cx={rectanglePreview.corners[2].x}
          cy={rectanglePreview.corners[2].z}
          r={s(0.22)}
          fill="none"
          stroke="#2563eb"
          stroke-width={s(0.045)}
          pointer-events="none"
        />
      {:else if previewLine?.wallSnap || previewLine?.nodeSnap}
        <circle
          cx={previewLine.x2}
          cy={previewLine.z2}
          r={s(0.22)}
          fill="none"
          stroke="#2563eb"
          stroke-width={s(0.045)}
          pointer-events="none"
        />
      {:else if hoveredBelow}
        <circle
          cx={hoveredBelow.x}
          cy={hoveredBelow.z}
          r={s(0.22)}
          fill="none"
          stroke="#2563eb"
          stroke-width={s(0.045)}
          pointer-events="none"
        />
      {:else if hoveredWall}
        <circle
          cx={hoveredWall.x}
          cy={hoveredWall.z}
          r={s(0.22)}
          fill="none"
          stroke="#2563eb"
          stroke-width={s(0.045)}
          pointer-events="none"
        />
      {/if}
      {#if (tool === 'draw-double' || tool === 'draw-logical' || tool === 'draw-rect') && pointerPlan}
        <circle
          cx={pointerPlan.x}
          cy={pointerPlan.z}
          r={CORNER_SNAP_M}
          fill="none"
          stroke="#93c5fd"
          stroke-width={s(0.025)}
          pointer-events="none"
        />
      {/if}
    {/if}
    </g>
  </svg>
    {#if chosenStair && !roofFloor}
      <aside class="inspector" aria-label="Stair">
        <h2 class="font-semibold">Stair</h2>
        <p>
          {chosenStair.layout.risers} risers of {Math.round(chosenStair.layout.riser * 1000)} mm and {chosenStair.layout
            .treads} goings of {Math.round(chosenStair.layout.going * 1000)} mm, {checkFormat.format(
            chosenStair.layout.length,
          )} m long.
        </p>
        <p class="text-muted-foreground">
          Laid out to SANS 10400 Part M: risers at most {Math.round(MAX_RISER_M * 1000)} mm, goings at least {Math.round(
            MIN_GOING_M * 1000,
          )} mm.
        </p>
        <div class="grid gap-1.5">
          <Label for="stair-width">Width (mm)</Label>
          <Input
            id="stair-width"
            type="number"
            min="600"
            step="50"
            value={Math.round(chosenStair.stair.width * 1000)}
            onchange={(event) => patchChosenStair({ width: Number(event.currentTarget.value) / 1000 })}
          />
        </div>
        <div class="grid gap-2">
          <Button variant="outline" onclick={turnChosenStair}><RotateCw />Turn around</Button>
          <Button variant="destructive" onclick={removeChosenStair}>Remove stair</Button>
        </div>
      </aside>
    {/if}
    {#if selectedRoom && !roofFloor}
      <aside class="inspector" aria-label="Room">
        {#if selectedRoom.resolved}
          {@const resolved = selectedRoom.resolved}
          <div class="grid gap-1.5">
            <Label for="room-name">Name</Label>
            <Input
              id="room-name"
              value={resolved.space.name}
              onchange={(event) => patchSelectedSpace({ name: event.currentTarget.value })}
            />
          </div>
          <div class="grid gap-1.5">
            <Label>Use</Label>
            <Select.Root
              type="single"
              value={resolved.space.type}
              onValueChange={(next) => patchSelectedSpace({ type: next as RoomType })}
            >
              <Select.Trigger class="w-full">{roomTypeLabel(resolved.space.type)}</Select.Trigger>
              <Select.Content>
                {#each ROOM_TYPES as option (option.type)}
                  <Select.Item value={option.type}>{option.label}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
          <div class="grid gap-1.5">
            <Label>Floor finish</Label>
            <Select.Root
              type="single"
              value={resolved.space.finish}
              onValueChange={(next) => patchSelectedSpace({ finish: next as FloorFinish })}
            >
              <Select.Trigger class="w-full">{FINISH_LABEL[resolved.space.finish]}</Select.Trigger>
              <Select.Content>
                {#each Object.entries(FINISH_LABEL) as [finish, label] (finish)}
                  <Select.Item value={finish}>{label}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
          <p>
            <span class="text-lg font-semibold">{areaFormat.format(resolved.area)} m²</span>
            <span class="text-muted-foreground">inside the walls{resolved.cells.length > 1
              ? `, in ${resolved.cells.length} parts`
              : ''}</span>
          </p>
          {#if selectedChecks}
            <section class="grid gap-2 border-t pt-3" aria-label="SANS 10400 checks">
              <h3 class="text-xs font-medium tracking-wide text-muted-foreground uppercase">SANS 10400</h3>
              {#each selectedChecks.checks as item (item.id)}
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <div>{item.label}</div>
                    <div class="text-xs text-muted-foreground">
                      needs {checkFormat.format(item.required)}{item.unit === '%' ? '%' : ` ${item.unit}`} · Part {item.part}
                    </div>
                  </div>
                  <Badge
                    variant={item.ok ? 'secondary' : 'outline'}
                    class={item.ok ? '' : 'border-amber-600/40 text-amber-700'}
                  >
                    {checkFormat.format(item.measured)}{item.unit === '%' ? '%' : ` ${item.unit}`}
                  </Badge>
                </div>
              {/each}
            </section>
          {:else if !isHabitable(resolved.space.type)}
            <p class="text-muted-foreground">Not a habitable room, so the daylight and size checks do not apply.</p>
          {/if}
          <p class="text-xs text-muted-foreground">Shift-click a neighbouring part to join it, or one of its parts to split it off.</p>
        {:else}
          <p>
            <span class="text-lg font-semibold">{areaFormat.format(selectedRoom.cell.netArea)} m²</span>
            <span class="text-muted-foreground">inside the walls</span>
          </p>
          <div class="grid gap-1.5">
            <Label>Use</Label>
            <Select.Root type="single" bind:value={newRoomType}>
              <Select.Trigger class="w-full">{roomTypeLabel(newRoomType)}</Select.Trigger>
              <Select.Content>
                {#each ROOM_TYPES as option (option.type)}
                  <Select.Item value={option.type}>{option.label}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
          <Button onclick={nameSelectedRoom}>Name this room</Button>
        {/if}
      </aside>
    {/if}
    {#if roofFloor}
      <aside class="inspector" aria-label="Roof">
        <h2 class="font-semibold">Roof</h2>
        {#if roofFloor.roof}
          {@const roof = roofFloor.roof}
          <div class="grid gap-1.5">
            <Label>Form</Label>
            <Select.Root type="single" value={roof.form ?? 'hip'} onValueChange={(next) => setRoofForm(next as RoofForm)}>
              <Select.Trigger class="w-full">{ROOF_FORMS[roof.form ?? 'hip']}</Select.Trigger>
              <Select.Content>
                {#each Object.entries(ROOF_FORMS) as [form, label] (form)}
                  <Select.Item value={form}>{label}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
          {#if (roof.form ?? 'hip') !== 'hip'}
            <Button variant="outline" onclick={turnRoof}>
              <RotateCw />{roof.form === 'gable' ? 'Turn the ridge' : 'Turn the fall'}
            </Button>
          {/if}
          <div class="grid gap-1.5">
            <Label>Covering</Label>
            <Select.Root
              type="single"
              value={roof.covering ?? DEFAULT_COVERING}
              onValueChange={(next) => setRoofCovering(next as RoofCovering)}
            >
              <Select.Trigger class="w-full">{coveringOf(roof).name}</Select.Trigger>
              <Select.Content>
                {#each COVERINGS as option (option.id)}
                  <Select.Item value={option.id}>{option.name}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="grid gap-1.5">
              <Label for="roof-pitch">Pitch (°)</Label>
              <Input
                id="roof-pitch"
                type="number"
                min="1"
                max="89"
                step="1"
                value={roof.pitchDeg}
                onchange={(event) => setRoofPitch(Number(event.currentTarget.value))}
              />
            </div>
            <div class="grid gap-1.5">
              <Label for="roof-eaves">Eaves (mm)</Label>
              <Input
                id="roof-eaves"
                type="number"
                min="0"
                step="10"
                value={Math.round(roof.eaves * 1000)}
                onchange={(event) => setRoofEavesMm(Number(event.currentTarget.value))}
              />
            </div>
          </div>
          {#if roof.pitchDeg < coveringOf(roof).minPitchDeg}
            <p class="text-amber-700">
              {coveringOf(roof).name} usually need at least {coveringOf(roof).minPitchDeg}°. Check the manufacturer's
              minimum.
            </p>
          {/if}
          <Button variant="destructive" onclick={removeRoof}>Remove roof</Button>
        {:else}
          <p class="text-muted-foreground">This storey is an empty plate on the walls below.</p>
          <Button onclick={addRoof}>Add roof</Button>
        {/if}
      </aside>
    {/if}
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

  .stage {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    position: relative;
  }

  .key {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 0.35rem;
    width: auto;
    flex-shrink: 0;
    overflow-x: auto;
    padding: 0.4rem 0.5rem;
    background: var(--background);
    border-bottom: 1px solid var(--border);
  }

  .inspector {
    position: absolute;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow-y: auto;
    background: var(--background);
    padding: 1rem;
    padding-bottom: max(1rem, env(safe-area-inset-bottom));
    font-size: 0.875rem;
    inset: auto 0 0 0;
    max-height: min(24rem, 62%);
    width: 100%;
    border-top: 1px solid var(--border);
  }

  @media (min-width: 768px) {
    .stage {
      flex-direction: row;
    }

    .key {
      flex-direction: column;
      align-items: stretch;
      justify-content: flex-end;
      width: 8.5rem;
      overflow-x: visible;
      padding: 0.75rem 0.5rem;
      border-bottom: none;
      border-right: 1px solid var(--border);
    }

    .inspector {
      inset: 0 0 0 auto;
      max-height: none;
      width: 16rem;
      border-top: none;
      border-left: 1px solid var(--border);
      padding-bottom: 1rem;
    }
  }

  .canvas {
    flex: 1;
    width: auto;
    min-width: 0;
    min-height: 0;
    touch-action: none;
    cursor: crosshair;
  }

  .canvas.panning {
    cursor: grab;
  }

  .room-name {
    fill: #27272a;
    font-family: system-ui, sans-serif;
    font-weight: 600;
  }

  .room-area {
    fill: #52525b;
    font-family: system-ui, sans-serif;
  }

  .stair-flight {
    fill: #fafaf9;
    stroke: #52525b;
    stroke-width: 0.03;
  }

  .stair-flight.chosen {
    fill: #eff6ff;
    stroke: #2563eb;
  }

  .stair-flight.preview {
    fill: rgba(37, 99, 235, 0.08);
    stroke: #2563eb;
    stroke-dasharray: 0.15 0.1;
  }

  .stair-nosing {
    stroke: #71717a;
    stroke-width: 0.015;
  }

  .stair-arrow {
    stroke: #27272a;
    stroke-width: 0.025;
  }

  .stair-foot {
    fill: #27272a;
  }

  .stair-void {
    fill: rgba(255, 255, 255, 0.6);
    stroke: #71717a;
    stroke-width: 0.025;
    stroke-dasharray: 0.2 0.12;
  }

  .room-name.short,
  .room-area.short {
    fill: #b45309;
  }

  .rotate {
    cursor: grab;
  }

</style>
