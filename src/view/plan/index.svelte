<script lang="ts">
  import { fencePosts, fenceSpec } from '../../lib/model/fences'
  import { floorSupports, pierSide, supportSpec } from '../../lib/model/supports'
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
  import Plug from '@lucide/svelte/icons/plug'
  import Grid2x2 from '@lucide/svelte/icons/grid-2x2'
  import CarFront from '@lucide/svelte/icons/car-front'
  import ChefHat from '@lucide/svelte/icons/chef-hat'
  import Mountain from '@lucide/svelte/icons/mountain'
  import Maximize2 from '@lucide/svelte/icons/maximize-2'
  import Check from '@lucide/svelte/icons/check'
  import Undo2 from '@lucide/svelte/icons/undo-2'
  import FixtureSymbol from './FixtureSymbol.svelte'
  import ContextPanel from '../shared/ContextPanel.svelte'
  import FittingSetup from '../shared/FittingSetup.svelte'
  import {
    FIXTURES,
    fixtureFootprint,
    sizeName,
    stepSize,
    type SizeSetup,
    fixtureSize,
    fixtureSpec,
  } from '../../lib/model/fixtures'
  import { fixtureWall, placeFixture, siteField, type FixturePlacement } from '../../lib/geometry/fixtures'
  import { suggestRoomFixtures } from '../../lib/geometry/suggest'
  import { electricalIssues, electricalLayout, type Circuit } from '../../lib/geometry/electrical'
  import { gasLayout } from '../../lib/geometry/gas'
  import { centreDashes, plotSide, roadReach, roadStrips } from '../../lib/geometry/roads'
  import { apronPolygons, guidePavingPoint, PAVING, PAVING_LIST, pavingAt, pavingPieces, pavingRectangle, pavingSnapTargets } from '../../lib/geometry/paving'
  import {
    DEFAULT_SEWER_DEPTH_M,
    DRAIN_FALL,
    plumbingLayout,
    SEPTIC_CLEAR_BUILDING_M,
    SEPTIC_INLET_DEPTH_M,
    SOAKAWAY_CLEAR_BOUNDARY_M,
    SOAKAWAY_CLEAR_BUILDING_M,
    soakawayPoint,
  } from '../../lib/geometry/plumbing'
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
  import { connectedCornerIds } from '../../lib/geometry/pad'
  import { solidWallPolygonsForFloor, type SvgPoint } from '../../lib/export/svg'
  import { cornerById } from '../../lib/model/geom'
  import { deriveRooms, roomKey } from '../../lib/model/rooms'
  import {
    cellAt,
    floorCells,
    layoutSpaces,
    ringLabelPoint,
    ROOM_TYPES,
    roomTypeLabel,
    type Cell,
  } from '../../lib/geometry/spaces'
  import SwatchPicker from '$lib/components/project/SwatchPicker.svelte'
  import { floorSwatch, pavingSwatch } from '$lib/components/project/swatches'
  import { FLOOR_FINISHES, floorFinishSpec } from '../../lib/model/floorFinishes'
  import { buildingChecks, checksForSpace, FENESTRATION_MAX_RATIO } from '../../lib/geometry/sans'
  import { isHabitable } from '../../lib/geometry/spaces'
  import { MAX_RISER_M, MIN_GOING_M, placeStair, stairLayout, stairVoids } from '../../lib/geometry/stairs'
  import type { Carport, CarportRoof, Fixture, FixtureKind, PavingSurface, ServiceKind, SewerType, Stair } from '../../lib/model/types'
  import { carportAt, carportIssues, snapCarport } from '../../lib/geometry/carports'
  import { alterations } from '../../lib/geometry/alterations'
  import { view as shown, workspace } from '../../lib/state/workspace.svelte'
  import { groundOf, measureRetaining, retainingAt, retainingSamples } from '../../lib/geometry/retaining'
  import { RETAINING_ENGINEER_M, RETAINING_TYPES, retainingSpec } from '../../lib/model/retaining'
  import type { RetainingType } from '../../lib/model/types'
  import { counterAlongFace, counterAt, counterBetween, counterCarried, counterFace, counterIssues, type CounterFace } from '../../lib/geometry/counters'
  import { COUNTER_KINDS, COUNTER_TOPS, counterKindSpec, counterProblem, counterRing, counterTopSpec, counterUnder } from '../../lib/model/counters'
  import type { Counter, CounterKind, CounterTop } from '../../lib/model/types'
  import { CARPORT_BAYS, CARPORT_ROOFS, carportName, carportPosts, carportProblem, carportRing, carportRoofSpec, carportSize } from '../../lib/model/carports'
  import { pointInRing } from '../../lib/geometry/pad'
  import {
    pointInsideRings,
    storeyFootprint,
    storeyUnderlay,
    MAX_STOREYS,
    topStoreyIndex,
    supportingFloor,
  } from '../../lib/model/stories'
  import { COVERINGS, coveringOf, DEFAULT_COVERING, fitPitch } from '../../lib/geometry/coverings'
  import { GUTTERS, gutterLayout, gutterOf, linkTanks } from '../../lib/geometry/gutters'
  import type { GutterType, Roof, RoofCovering } from '../../lib/model/types'
  import type { Floor, RoofForm, RoomType, Space, WallSkin } from '../../lib/model/types'
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

  type Tool = 'draw-double' | 'draw-logical' | 'draw-rect' | 'draw-stair' | 'draw-fixture' | 'draw-paving' | 'draw-carport' | 'draw-counter' | 'draw-retaining' | 'select'

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
  // Paving: the area picked ('apron' for the strip round the house), and one being drawn, corner by corner.
  let selectedPaving = $state<string | null>(null)
  // Counters: the one picked; the kind and worktop of the next; and where the one being drawn was started, on a
  // wall face for a counter against a wall or at a corner for one standing free.
  let selectedCounter = $state<string | null>(null)
  let counterKind = $state<CounterKind>('base')
  let counterTop = $state<CounterTop>('laminate')
  let counterStart = $state<{ face: CounterFace | null; point: { x: number; z: number } } | null>(null)
  // The room being laid out on its own, by the id of its space; the rest of the plan is veiled.
  let focusedRoom = $state<string | null>(null)
  // Retaining walls: the one picked, the kind of the next, and the points of one being drawn.
  let selectedRetaining = $state<string | null>(null)
  let retainingType = $state<RetainingType>('blocks')
  let retainingDraft = $state<{ x: number; z: number }[]>([])
  // A house marked as built: whether what has changed since is picked out on the plan.
  const changes = $derived.by(() => (shown.showChanges ? alterations(document) : null))
  const changesHere = $derived(
    changes
      ? {
          built: changes.built.filter((piece) => piece.floorIndex === activeStoreyIndex),
          demolished: changes.demolished.filter((piece) => piece.floorIndex === activeStoreyIndex),
          cut: changes.cut.filter((opening) => opening.floorIndex === activeStoreyIndex),
          closed: changes.closed.filter((opening) => opening.floorIndex === activeStoreyIndex),
        }
      : null,
  )
  // Carports: the one picked, and the size, roof and turn of the next one to be placed.
  let selectedCarport = $state<string | null>(null)
  let carportBays = $state<Carport['bays']>(2)
  let carportRoof = $state<CarportRoof>('sheet')
  let carportTurn = $state(0)
  let pavingDraft = $state<{ x: number; z: number }[]>([])
  let pavingShape = $state<'rect' | 'outline'>('rect')
  let pavingSurface = $state<PavingSurface>('concrete')
  let selectedOutline = $state<{ floorId: string | null; ring: number; edge: number } | null>(null)
  let selectedCornerId = $state<string | null>(null)
  let selectedPlateFloorId = $state<string | null>(null)
  let selectedPlateRing = $state<number | null>(null)
  let selectedCell = $state<{ floorId: string; x: number; z: number } | null>(null)
  let newRoomType = $state<RoomType>('bedroom')
  let stairTurn = $state(0)
  let fixtureKind = $state<FixtureKind>('socket')
  // Sizes chosen for fittings that come in sizes, before they are placed: − and + step through them.
  let placeSizes = $state<Partial<Record<FixtureKind, SizeSetup>>>({})
  let fixtureTurn = $state(0)
  let selectedFixture = $state<{ floorId: string; id: string } | null>(null)
  let selectedService = $state<ServiceKind | null>(null)
  let selectedBend = $state<number | null>(null)
  // Dragging the connection (end) or a bend; a new bend is inserted at `insert` before it is dragged.
  // A fitting being dragged in Select: where it would land, re-snapped to the walls as it goes.
  // A counter being dragged: where along it (and across it) it was picked up, and where it would be set down.
  // A carport being dragged: where it was picked up, and where it would land.
  let carportMove = $state<{ id: string; grabX: number; grabZ: number; preview: Carport | null; problem: string | null } | null>(null)
  let counterMove = $state<{ id: string; grabAlong: number; grabOut: number; preview: Counter | null } | null>(null)
  let fixtureMove = $state<{ floorId: string; id: string; preview: Fixture | null } | null>(null)
  let serviceDrag = $state<{ kind: ServiceKind; target: 'end' | 'soakaway' | number; point: { x: number; z: number }; moved: boolean } | null>(null)
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
  const defaultSystem = $derived(wallSystem(documentStore.document.building.wallSystemId))
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

  const floorOptions = FLOOR_FINISHES.map((item) => ({ id: item.id, name: item.name, swatch: item.id === 'none' ? null : floorSwatch(item.id), title: `${item.name}. ${item.text}` }))
  const pavingOptions = PAVING_LIST.map((item) => ({ id: item.id, name: item.name, swatch: pavingSwatch(item.id) }))

  // Whether a cell belongs to the room picked. It is washed blue over its floor finish, so the finish still shows
  // while it is being chosen.
  function cellChosen(cornerIds: string[]): boolean {
    const space = spaceByRoom[roomKey(cornerIds)]
    const chosen = selectedRoom
    if (!chosen) return false
    if (space && chosen.resolved?.space.id === space.id) return true
    return !chosen.resolved && roomKey(chosen.cell.room.cornerIds) === roomKey(cornerIds)
  }

  function cellFill(cornerIds: string[]): string {
    const space = spaceByRoom[roomKey(cornerIds)]
    if (!space) return 'rgba(120, 120, 120, 0.08)'
    // Each floor finish has its own pattern, drawn to scale: tiles, boards, planks, carpet.
    return space.finish === 'none' ? 'rgba(120, 120, 120, 0.1)' : `url(#floor-${space.finish})`
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

  // The roads beside the plot, and the view widened to take in their far kerbs.
  const roads = $derived(roadStrips(document.plot))
  const bounds = $derived(plotBounds([...plotRing, ...roadReach(document.plot)], PLOT_MARGIN_M))

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
  const contours = $derived.by(() => contourPlanPaths(siteField(document)))

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
    if (tool === 'draw-retaining') {
      if (retainingDraft.length > 0) retainingDraft = []
      else setTool('select')
      errorMessage = null
      return
    }
    if (tool === 'draw-counter') {
      if (counterStart) counterStart = null
      else setTool('select')
      errorMessage = null
      return
    }
    if (tool === 'draw-carport') {
      setTool('select')
      errorMessage = null
      return
    }
    if (tool === 'draw-paving') {
      if (pavingDraft.length > 0) pavingDraft = []
      else setTool('select')
      errorMessage = null
      return
    }
    if (tool === 'draw-stair' || tool === 'draw-fixture') {
      setTool('select')
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
    if (tool === 'draw-paving' && event.button === 0) {
      finishPavingOutline()
      return
    }
    if (tool === 'draw-retaining' && event.button === 0) {
      finishRetaining()
      return
    }
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
    fixture?: { floorId: string; id: string } | null
    service?: ServiceKind | null
    bend?: number | null
    paving?: string | null
    carport?: string | null
    counter?: string | null
    retaining?: string | null
  }) {
    selectedRetaining = next.retaining ?? null
    selectedCounter = next.counter ?? null
    selectedPaving = next.paving ?? null
    selectedCarport = next.carport ?? null
    selectedCell = next.cell ?? null
    selectedStair = next.stair ?? null
    selectedFixture = next.fixture ?? null
    selectedService = next.service ?? null
    selectedBend = next.bend ?? null
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

    if (tool === 'draw-fixture') {
      placeFixtureAt(plan)
      return
    }

    if (tool === 'draw-paving') {
      pavingClick(plan)
      return
    }

    if (tool === 'draw-carport') {
      placeCarport()
      return
    }

    if (tool === 'draw-counter') {
      counterClick(plan)
      return
    }

    if (tool === 'draw-retaining') {
      retainingClick(plan)
      return
    }

    if (tool === 'select') {
      if (beginServiceDrag(plan, event)) return
      if (beginNodeDrag(activeFloor, plan, event)) return
      // A fitting set into a counter is picked before the counter it stands in.
      const hit = fixtureAt(plan.x, plan.z)
      const setIn = hit && levelFixtures.find((item) => item.fixture.id === hit.id)?.fixture
      const worktop = setIn && counterUnder(activeFloor.counters, setIn.x, setIn.z) ? null : counterAt(activeFloor, plan)
      if (worktop) {
        chooseSelection({ counter: worktop.id })
        // A counter can be dragged: along its wall or to another, or anywhere if it stands free.
        counterMove = {
          id: worktop.id,
          grabAlong: (plan.x - worktop.x) * worktop.dx + (plan.z - worktop.z) * worktop.dz,
          grabOut: (plan.x - worktop.x) * -worktop.dz + (plan.z - worktop.z) * worktop.dx,
          preview: null,
        }
        svgEl?.setPointerCapture(event.pointerId)
        return
      }
      const fixture = fixtureAt(plan.x, plan.z)
      if (fixture) {
        chooseSelection({ fixture })
        // Floor-standing fittings can be dragged to a new spot; wall points are moved in Focus.
        const found = levelFixtures.find((item) => item.fixture.id === fixture.id)
        if (found && fixtureSpec(found.fixture.kind).mount === 'floor') {
          fixtureMove = { floorId: fixture.floorId, id: fixture.id, preview: null }
          svgEl?.setPointerCapture(event.pointerId)
        }
        return
      }
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
      const held = activeStoreyIndex === 0 ? retainingAt(document, plan, s(0.3)) : null
      if (held) {
        chooseSelection({ retaining: held.id })
        return
      }
      const parked = activeStoreyIndex === 0 ? carportAt(document, plan) : null
      if (parked) {
        chooseSelection({ carport: parked.id })
        carportMove = { id: parked.id, grabX: plan.x - parked.x, grabZ: plan.z - parked.z, preview: null, problem: null }
        svgEl?.setPointerCapture(event.pointerId)
        return
      }
      const paved = activeStoreyIndex === 0 ? pavingAt(document, plan) : null
      if (paved) {
        chooseSelection({ paving: paved.kind === 'apron' ? 'apron' : paved.id })
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
    // A rectangle is a one-off: the next click draws walls again.
    tool = toolBeforeRect
  }

  // How near a corner a click has to be to mean the corner itself and not the wall running into it.
  const NODE_DOT_M = 0.15

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
    // Nothing is dragged about in an example being previewed.
    if (documentStore.readOnly && event.buttons !== 0) return
    const svg = svgEl
    if (!svg) return
    const plan = clientToPlan(svg, event.clientX, event.clientY)
    pointerPlan = plan
    if (!plan || !activeFloor) return
    if (serviceDrag) {
      if (pointInPlot(document.plot, plan.x, plan.z)) serviceDrag = { ...serviceDrag, point: { x: plan.x, z: plan.z }, moved: true }
      return
    }
    if (carportMove) {
      const moving = carportMove
      const item = document.carports?.find((entry) => entry.id === moving.id)
      if (!item) return
      const loose = { ...item, x: plan.x - moving.grabX, z: plan.z - moving.grabZ }
      // Nothing happens until it has been carried a little way, so a click to pick it does not nudge it.
      if (!moving.preview && Math.hypot(loose.x - item.x, loose.z - item.z) < s(0.15)) return
      // Its corners snap to everything but itself.
      const others = { ...document, carports: (document.carports ?? []).filter((entry) => entry.id !== item.id) }
      const preview = { ...loose, ...snapCarport(others, loose, s(0.4)) }
      carportMove = { ...moving, preview, problem: carportProblem(others, preview) }
      return
    }
    if (counterMove) {
      const moving = counterMove
      const item = activeFloor?.counters?.find((entry) => entry.id === moving.id)
      if (!activeFloor || !item) return
      if (item.kind === 'base') {
        const carried = counterCarried(activeFloor, item, plan, moving.grabAlong, Math.max(0.9, s(0.6)))
        if (carried) counterMove = { ...moving, preview: { ...item, ...carried } }
      } else {
        const snap = (value: number) => Math.round(value * 20) / 20
        const x = snap(plan.x - item.dx * moving.grabAlong + item.dz * moving.grabOut)
        const z = snap(plan.z - item.dz * moving.grabAlong - item.dx * moving.grabOut)
        counterMove = { ...moving, preview: { ...item, x, z } }
      }
      return
    }
    if (fixtureMove) {
      const moving = fixtureMove
      const floor = levelFloors.find((item) => item.id === moving.floorId)
      const item = floor?.fixtures?.find((entry) => entry.id === moving.id)
      if (!floor || !item) return
      const placement = placeFixture(floor, plan, item.kind, { x: item.dx, z: item.dz }, { setup: setupOf(item), downpipes: downpipeSpots, plot: plotRing })
      if (!placement.problem) fixtureMove = { ...moving, preview: { ...item, ...placement.fixture, id: item.id } }
      return
    }
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
    const parked = carportMove
    if (parked) {
      carportMove = null
      const next = parked.preview
      if (next) applyResult(documentStore.updateCarport(parked.id, { x: next.x, z: next.z }))
      return
    }
    const carried = counterMove
    if (carried) {
      counterMove = null
      const next = carried.preview
      if (next && activeFloor) applyResult(documentStore.updateCounter(activeFloor.id, carried.id, { x: next.x, z: next.z, dx: next.dx, dz: next.dz }))
      return
    }
    const moved = fixtureMove
    if (moved) {
      fixtureMove = null
      const next = moved.preview
      if (next) applyResult(documentStore.updateFixture(moved.floorId, moved.id, { x: next.x, z: next.z, dx: next.dx, dz: next.dz, ...(next.builtIn ? { builtIn: true } : {}) }))
      return
    }
    const dragging = serviceDrag
    if (dragging) {
      serviceDrag = null
      if (dragging.moved) {
        if (dragging.target === 'end') applyResult(documentStore.setServicePoint(dragging.kind, dragging.point))
        else if (dragging.target === 'soakaway') applyResult(documentStore.setSoakaway(dragging.point))
        else applyResult(documentStore.setServiceBends(dragging.kind, bendsWith(dragging.kind, dragging.target, dragging.point)))
      }
      return
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
    if (drag.dx === 0 && drag.dz === 0) {
      // A click, not a drag. On a wall and clear of the corner's own dot it picks the wall: a wall shorter than
      // the reach of its two corners could not be picked at all otherwise.
      const corner = cornerById(activeFloor.corners, drag.nodeId)
      const onWall = pickWall(activeFloor, drag.startX, drag.startZ)
      if (corner && onWall && Math.hypot(drag.startX - corner.x, drag.startZ - corner.z) > NODE_DOT_M) chooseSelection({ wallId: onWall })
      else chooseSelection({ cornerId: drag.nodeId })
      return
    }
    chooseSelection({ cornerId: drag.nodeId })
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

  function setTool(chosen: Tool) {
    // An example being previewed can be picked over but not drawn on.
    const next = documentStore.readOnly ? 'select' : chosen
    tool = next
    pavingDraft = []
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
        pitchDeg: fitPitch(defaults.roofPitchDeg, defaults.roofCovering),
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
    applyResult(documentStore.setRoof(floor.id, { ...current, form, turns: 0, pitchDeg: fitPitch(pitchDeg, current.covering) }))
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
    applyResult(documentStore.setRoof(floor.id, { ...floor.roof, covering, pitchDeg: fitPitch(floor.roof.pitchDeg, covering, floor.roof.covering ?? DEFAULT_COVERING) }))
  }

  function floorRoof(floorId: string, roof: Roof) {
    applyResult(documentStore.setRoof(floorId, roof))
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

  function stairProblemText(problem: string): string {
    if (problem === 'stair must fit inside one room') return 'The stair has to fit inside one room.'
    if (problem === 'add a storey above the stair first') return 'Add a storey above first; the stair needs somewhere to arrive.'
    return problem
  }

  const stairGhost = $derived.by(() => {
    const pointer = pointerPlan
    if (tool !== 'draw-stair' || !pointer || !activeFloor) return null
    const floorId = floorIdForPoint(pointer.x, pointer.z)
    const floor = floorId ? floors.find((item) => item.id === floorId) : undefined
    if (!floor) return null
    const grid = highlightedDirection(activeFloor)
    const length = grid ? Math.hypot(grid.dx, grid.dz) : 0
    let preferred = grid && length > 1e-9 ? { x: grid.dx / length, z: grid.dz / length } : { x: 1, z: 0 }
    for (let i = 0; i < ((stairTurn % 4) + 4) % 4; i++) preferred = { x: -preferred.z, z: preferred.x }
    return { floorId: floor.id, placement: placeStair(document, floor, pointer, preferred) }
  })

  function placeStairPoint(plan: { x: number; z: number }) {
    if (!activeFloor) return
    pointerPlan = plan
    const ghost = stairGhost
    if (!ghost) {
      errorMessage = 'Click inside a room to place the stair.'
      return
    }
    const { stair, problem } = ghost.placement
    if (problem) {
      errorMessage = stairProblemText(problem)
      return
    }
    const result = documentStore.addStair(ghost.floorId, stair.x, stair.z, stair.dx, stair.dz, stair.width)
    if (!applyResult(result)) return
    const placed = result.document.building.floors.find((floor) => floor.id === ghost.floorId)?.stairs?.at(-1)
    setTool('select')
    if (placed) chooseSelection({ stair: { floorId: ghost.floorId, id: placed.id } })
  }

  $effect(() => {
    if (tool !== 'draw-stair') return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'r' && event.key !== 'R') return
      if (event.metaKey || event.ctrlKey || event.altKey || typingTarget(event)) return
      event.preventDefault()
      stairTurn += stairGhost?.placement.snap ? 2 : 1
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const levelFixtures = $derived(
    levelFloors.flatMap((floor) => (floor.fixtures ?? []).map((fixture) => ({ floorId: floor.id, fixture }))),
  )

  const chosenFixture = $derived.by(() => {
    const pick = selectedFixture
    if (!pick) return null
    const found = levelFixtures.find((item) => item.fixture.id === pick.id)
    if (!found) return null
    const floor = floors.find((item) => item.id === found.floorId)
    return { ...found, spec: fixtureSpec(found.fixture.kind), onWall: floor ? fixtureWall(floor, found.fixture) : null }
  })

  const plumbing = $derived(plumbingLayout(document))
  const showServices = $derived(activeStoreyIndex === 0 && plumbing.exit !== null)

  function bendsWith(kind: ServiceKind, index: number, point: { x: number; z: number }): { x: number; z: number }[] {
    const bends = [...(document.services?.bends?.[kind] ?? [])]
    if (index >= bends.length || index < 0) return bends
    bends[index] = point
    return bends
  }

  // The route as drawn, with any drag in progress applied.
  function shownPath(kind: ServiceKind): { x: number; z: number }[] {
    const exit = plumbing.exit
    if (!exit) return []
    const end = kind === 'sewer' ? plumbing.sewer : plumbing.water
    const bends = [...(document.services?.bends?.[kind] ?? [])]
    const drag = serviceDrag
    if (drag && drag.kind === kind) {
      if (drag.target === 'end') return [exit, ...bends, drag.point]
      if (drag.target === 'soakaway') return [exit, ...bends, end]
      bends[drag.target] = drag.point
    }
    return [exit, ...bends, end]
  }

  const sewerPath = $derived(showServices ? shownPath('sewer') : [])
  const waterPath = $derived(showServices ? shownPath('water') : [])
  const sewerProfile = $derived.by(() => {
    if (!showServices || plumbing.drains.length === 0) return null
    if (!serviceDrag || serviceDrag.kind !== 'sewer') return plumbing.profile
    const bends = sewerPath.slice(1, -1)
    const end = sewerPath.at(-1)!
    const draft = { ...document, services: { ...(document.services ?? {}), sewer: end, bends: { ...(document.services?.bends ?? {}), sewer: bends } } }
    return plumbingLayout(draft).profile
  })

  const soakaway = $derived.by(() => {
    if (!showServices || !plumbing.septic) return null
    const drag = serviceDrag
    if (drag?.target === 'soakaway') return drag.point
    if (drag?.target === 'end') return soakawayPoint({ ...document, services: { ...(document.services ?? {}), sewer: drag.point } }, drag.point, plumbing.exit)
    return plumbing.septic.soakaway
  })

  function nearSegment(path: { x: number; z: number }[], x: number, z: number, reach: number): number | null {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]
      const b = path[i]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)))
      if (Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)) < reach) return i
    }
    return null
  }

  function beginServiceDrag(plan: { x: number; z: number }, event: PointerEvent): boolean {
    if (!showServices || !svgEl) return false
    const grab = s(0.6)
    for (const kind of ['sewer', 'water'] as ServiceKind[]) {
      const path = kind === 'sewer' ? sewerPath : waterPath
      if (path.length < 2) continue
      const end = path.at(-1)!
      const start = (target: 'end' | 'soakaway' | number, point: { x: number; z: number }) => {
        chooseSelection({ service: kind, bend: typeof target === 'number' ? target : null })
        serviceDrag = { kind, target, point, moved: false }
        svgEl?.setPointerCapture(event.pointerId)
        return true
      }
      if (Math.hypot(end.x - plan.x, end.z - plan.z) < grab) return start('end', end)
      const pit = soakaway
      if (kind === 'sewer' && pit && Math.hypot(pit.x - plan.x, pit.z - plan.z) < Math.max(grab, 1.2)) return start('soakaway', pit)
      if (selectedService === kind) {
        for (let i = 1; i < path.length - 1; i++) {
          if (Math.hypot(path[i].x - plan.x, path[i].z - plan.z) < grab) return start(i - 1, path[i])
        }
        for (let i = 1; i < path.length; i++) {
          const mid = { x: (path[i - 1].x + path[i].x) / 2, z: (path[i - 1].z + path[i].z) / 2 }
          if (Math.hypot(mid.x - plan.x, mid.z - plan.z) < grab) {
            const bends = [...(document.services?.bends?.[kind] ?? [])]
            bends.splice(i - 1, 0, mid)
            if (!applyResult(documentStore.setServiceBends(kind, bends))) return true
            return start(i - 1, mid)
          }
        }
      }
      if (nearSegment(path, plan.x, plan.z, s(0.25)) !== null) {
        chooseSelection({ service: kind })
        return true
      }
    }
    return false
  }

  function removeSelectedBend() {
    const kind = selectedService
    const index = selectedBend
    if (!kind || index === null) return
    const bends = [...(document.services?.bends?.[kind] ?? [])]
    bends.splice(index, 1)
    if (applyResult(documentStore.setServiceBends(kind, bends))) chooseSelection({ service: kind })
  }

  function straightenSelected() {
    const kind = selectedService
    if (!kind) return
    if (applyResult(documentStore.setServiceBends(kind, []))) chooseSelection({ service: kind })
  }

  const gas = $derived(gasLayout(document))
  // Downpipes come down to the ground floor, where rainwater tanks can stand under them.
  const eaves = $derived(gutterLayout(document))
  const downpipeSpots = $derived(activeStoreyIndex === 0 ? eaves.downpipes : [])
  // A rainwater tank being dragged or placed connects to downpipes near where it would land.
  const shownDownpipes = $derived.by(() => {
    if (activeStoreyIndex !== 0) return []
    const moving = fixtureMove?.preview
    const ghost = fixtureGhost && !fixtureGhost.placement.problem && fixtureGhost.placement.fixture.kind === 'water-tank' ? fixtureGhost.placement.fixture : null
    const extra = [moving?.kind === 'water-tank' ? moving : null, ghost].filter((item) => item !== null)
    if (!moving && extra.length === 0) return eaves.downpipes
    const ground = document.building.floors.find((floor) => floor.index === 0)
    if (!ground) return eaves.downpipes
    const fixtures = (ground.fixtures ?? []).filter((item) => item.id !== moving?.id)
    const draft = { ...document, building: { ...document.building, floors: document.building.floors.map((floor) => (floor.id === ground.id ? { ...ground, fixtures: [...fixtures, ...extra.map((item, i) => ({ ...item, id: `preview-${i}` }))] } : floor)) } }
    return linkTanks(draft, eaves.downpipes)
  })

  // Gas bottles and rainwater tanks keep their own setup as they move.
  function setupOf(fixture: Fixture) {
    if (fixture.kind === 'gas-cylinder') return { bottles: fixture.bottles, bottleKg: fixture.bottleKg, cage: fixture.cage }
    if (fixture.kind === 'water-tank') return { litres: fixture.litres }
    if (fixture.builtIn) return { builtIn: true }
    return {}
  }
  // Gas pipes run round the outside of the ground floor; the chosen appliance or bottles pick out their own.
  const gasLines = $derived.by(() => {
    if (activeStoreyIndex !== 0) return []
    const id = chosenFixture?.fixture.id
    return gas.runs.map((run) => ({ id: run.item.fixture.id, path: run.path, chosen: id === run.item.fixture.id || id === run.cylinder.fixture.id }))
  })


  const wiring = $derived(electricalLayout(document))
  const wiringProblems = $derived(electricalIssues(document))

  const shownCircuits = $derived.by(() => {
    const chosen = chosenFixture
    if (!chosen) return []
    if (chosen.fixture.kind === 'db-board') return wiring.circuits
    return wiring.circuits.filter((circuit) => circuit.points.some((point) => point.fixture.id === chosen.fixture.id))
  })

  // Runs drawn square to the walls, as the cable goes across the ceiling.
  function circuitLines(circuit: Circuit): SvgPoint[] {
    const level = new Set(levelFloors.map((floor) => floor.id))
    const points: SvgPoint[] = []
    circuit.path.forEach((point, i) => {
      if (!level.has(point.floorId)) return
      const previous = circuit.path[i - 1]
      if (previous && level.has(previous.floorId)) points.push([point.x, previous.z])
      points.push([point.x, point.z])
    })
    return points
  }

  function fixtureAt(x: number, z: number): { floorId: string; id: string } | null {
    for (const item of [...levelFixtures].reverse()) {
      const ring = fixtureFootprint(item.fixture)
      const spec = fixtureSize(item.fixture)
      const hit = spec.width < 0.3 || spec.depth < 0.3
        ? Math.hypot(item.fixture.x - x, item.fixture.z - z) < 0.2
        : pointInRing(ring, x, z)
      if (hit) return { floorId: item.floorId, id: item.fixture.id }
    }
    return null
  }

  const fixtureGhost = $derived.by(() => {
    const pointer = pointerPlan
    if (tool !== 'draw-fixture' || !pointer || !activeFloor) return null
    const grid = highlightedDirection(activeFloor)
    const length = grid ? Math.hypot(grid.dx, grid.dz) : 0
    let preferred = grid && length > 1e-9 ? { x: grid.dx / length, z: grid.dz / length } : { x: 1, z: 0 }
    for (let i = 0; i < ((fixtureTurn % 4) + 4) % 4; i++) preferred = { x: -preferred.z, z: preferred.x }
    let best: { floorId: string; placement: FixturePlacement } | null = null
    for (const floor of levelFloors) {
      const placement = placeFixture(floor, pointer, fixtureKind, preferred, { setup: placeSizes[fixtureKind], downpipes: downpipeSpots, plot: plotRing })
      if (!best || (best.placement.problem && !placement.problem)) best = { floorId: floor.id, placement }
    }
    return best
  })

  // The size the next fitting will have: what the ghost shows, which may be the indoor default.
  const placeSize = $derived.by(() => {
    const shown = fixtureGhost?.placement.fixture
    const setup = shown ? { bottleKg: shown.bottleKg, litres: shown.litres, ...placeSizes[fixtureKind] } : placeSizes[fixtureKind]
    const name = sizeName(fixtureKind, setup)
    return name ? { name, setup: setup ?? {} } : null
  })

  function stepPlaceSize(by: 1 | -1) {
    const size = placeSize
    if (!size) return
    placeSizes = { ...placeSizes, [fixtureKind]: stepSize(fixtureKind, size.setup, by) }
  }

  // Paving corners snap to the plot, the house and other paving; a rectangle lies square to the drawing grid.
  const pavingTargets = $derived(pavingSnapTargets(document))
  const pavingAxis = $derived.by(() => {
    const grid = activeFloor ? highlightedDirection(activeFloor) : null
    return grid ? { x: grid.dx, z: grid.dz } : { x: 1, z: 0 }
  })
  // Where a corner would land, with the guides that say why: on a corner, along a side, or in line with another corner.
  function pavingSnap(plan: { x: number; z: number }) {
    return guidePavingPoint(plan, pavingTargets, s(0.5), { axis: pavingAxis, nodes: pavingDraft, align: s(0.3) })
  }
  const pavingGuide = $derived(pointerPlan && tool === 'draw-paving' ? pavingSnap(pointerPlan) : null)
  const pavingPoint = $derived(pavingGuide?.point ?? null)
  // An outline closes when the pointer is back on its first corner.
  const pavingCloses = $derived.by(() => {
    const first = pavingDraft[0]
    const at = pointerPlan
    return pavingShape === 'outline' && pavingDraft.length >= 3 && !!first && !!at && Math.hypot(first.x - at.x, first.z - at.z) <= s(0.5)
  })
  // The area being drawn, as it would be laid if the next click finished it.
  const pavingPreview = $derived.by((): [number, number][] => {
    const at = pavingPoint
    if (!at || pavingDraft.length === 0) return []
    if (pavingShape === 'rect') return pavingRectangle(pavingDraft[0], at, pavingAxis)
    return (pavingCloses ? pavingDraft : [...pavingDraft, at]).map((p) => [p.x, p.z] as [number, number])
  })

  function lay(ring: [number, number][]) {
    if (applyResult(documentStore.addPaving(ring, pavingSurface))) {
      const added = documentStore.document.paving?.at(-1)
      pavingDraft = []
      if (added) chooseSelection({ paving: added.id })
    }
  }

  function pavingClick(plan: { x: number; z: number }) {
    if (activeStoreyIndex !== 0) {
      errorMessage = 'Paving goes on the ground. Switch to the ground floor to lay it.'
      return
    }
    const at = pavingSnap(plan).point
    if (pavingShape === 'rect') {
      if (pavingDraft.length === 0) pavingDraft = [at]
      else lay(pavingRectangle(pavingDraft[0], at, pavingAxis))
      return
    }
    // An outline closes on its first corner.
    const first = pavingDraft[0]
    if (first && pavingDraft.length >= 3 && Math.hypot(first.x - plan.x, first.z - plan.z) <= s(0.5)) {
      lay(pavingDraft.map((p) => [p.x, p.z]))
      return
    }
    // A second click on the corner just placed (a double-click, or a double tap) adds nothing.
    const last = pavingDraft.at(-1)
    if (last && Math.hypot(last.x - at.x, last.z - at.z) < 0.02) return
    pavingDraft = [...pavingDraft, at]
  }

  function finishPavingOutline() {
    if (tool === 'draw-paving' && pavingShape === 'outline' && pavingDraft.length >= 3) lay(pavingDraft.map((p) => [p.x, p.z]))
  }

  function undoPavingCorner() {
    pavingDraft = pavingDraft.slice(0, -1)
  }

  $effect(() => {
    if (tool !== 'draw-paving') return
    const onKey = (event: KeyboardEvent) => {
      if (typingTarget(event)) return
      if (event.key === 'Enter') {
        event.preventDefault()
        finishPavingOutline()
      } else if (event.key === 'Backspace' && pavingDraft.length > 0) {
        event.preventDefault()
        undoPavingCorner()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // A counter against a wall is drawn along the wall's face: click where it starts, then where it ends. One standing
  // free (an island or a bar) is drawn corner to corner, square to the drawing grid.
  function counterStartAt(plan: { x: number; z: number }) {
    const face = counterKind === 'base' && activeFloor ? counterFace(activeFloor, plan, Math.max(0.35, s(0.45))) : null
    return { face, point: face?.point ?? { x: Math.round(plan.x * 20) / 20, z: Math.round(plan.z * 20) / 20 } }
  }
  const counterHover = $derived(tool === 'draw-counter' && pointerPlan && !counterStart ? counterStartAt(pointerPlan) : null)
  const counterDraft = $derived.by((): { counter: Omit<Counter, 'id'>; problem: string | null } | null => {
    const start = counterStart
    const at = pointerPlan
    if (tool !== 'draw-counter' || !start || !at) return null
    const spec = counterKindSpec(counterKind)
    let shape
    if (start.face) shape = counterAlongFace(start.face, at, spec.depth)
    else {
      shape = counterBetween(start.point, at, pavingAxis)
      // A bar keeps its own depth; an island takes the depth it is drawn to.
      if (counterKind === 'bar' || shape.depth < 0.3) shape = { ...shape, depth: spec.depth }
    }
    const counter = { ...shape, kind: counterKind, top: counterTop }
    return { counter, problem: counterProblem(counter) }
  })

  function counterClick(plan: { x: number; z: number }) {
    if (!activeFloor) return
    if (!counterStart) {
      const start = counterStartAt(plan)
      if (counterKind === 'base' && !start.face) {
        errorMessage = 'A counter stands against a wall. Click on the inside face of one, or choose Island or Bar.'
        return
      }
      errorMessage = null
      counterStart = start
      return
    }
    const draft = counterDraft
    if (!draft || draft.problem) return
    if (applyResult(documentStore.addCounter(activeFloor.id, draft.counter))) {
      const added = documentStore.document.building.floors.find((floor) => floor.id === activeFloor.id)?.counters?.at(-1)
      counterStart = null
      if (added) chooseSelection({ counter: added.id })
    }
  }

  const chosenCounter = $derived(selectedCounter && activeFloor ? (activeFloor.counters?.find((item) => item.id === selectedCounter) ?? null) : null)

  function patchChosenCounter(patch: Partial<Omit<Counter, 'id'>>) {
    if (chosenCounter && activeFloor) applyResult(documentStore.updateCounter(activeFloor.id, chosenCounter.id, patch))
  }

  function removeChosenCounter() {
    if (chosenCounter && activeFloor && applyResult(documentStore.removeCounter(activeFloor.id, chosenCounter.id))) chooseSelection({})
  }

  // Laying out one room on its own: the view closes in on it and the rest of the plan is veiled.
  const focusedCells = $derived.by(() => {
    if (!focusedRoom) return null
    for (const entry of levelLayouts) {
      const found = entry.layout.spaces.find((resolved) => resolved.space.id === focusedRoom)
      if (found) return { name: found.space.name, rings: found.cells.map((cell) => cell.ring) }
    }
    return null
  })

  function focusRoom(spaceId: string, rings: { x: number; z: number }[][]) {
    const points = rings.flat().map((p) => toScreen(p.x, p.z))
    if (points.length === 0) return
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const [w, h] = [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]
    const aspect = canvasSize.width / Math.max(1, canvasSize.height)
    const baseW = fitBox.w / fitBox.h < aspect ? fitBox.h * aspect : fitBox.w
    focusedRoom = spaceId
    centre = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
    zoom = Math.min(baseW / (w * 1.4 + 1.5), baseW / aspect / (h * 1.4 + 1.5))
  }

  function leaveRoom() {
    focusedRoom = null
    fitView()
  }

  $effect(() => {
    // The room focused on may be renamed, but if it goes, so does the focus.
    if (focusedRoom && !focusedCells) focusedRoom = null
  })

  // A retaining wall is drawn point to point along the ground and finished with a double-click, Enter or Finish.
  // What it holds back is read from the ground as it lies.
  const planGround = $derived((document.retaining ?? []).length > 0 || tool === 'draw-retaining' ? groundOf(document) : null)
  function retainingSnap(plan: { x: number; z: number }) {
    return guidePavingPoint(plan, pavingTargets, s(0.5), { axis: pavingAxis, nodes: retainingDraft, align: s(0.3) })
  }
  const retainingGuide = $derived(pointerPlan && tool === 'draw-retaining' ? retainingSnap(pointerPlan) : null)
  const guideTraces = $derived(snapTraces.length > 0 ? snapTraces : (pavingGuide?.traces ?? retainingGuide?.traces ?? []))
  const retainingPreview = $derived.by((): [number, number][] => {
    if (tool !== 'draw-retaining' || retainingDraft.length === 0) return []
    const at = retainingGuide?.point
    return [...retainingDraft, ...(at ? [at] : [])].map((p) => [p.x, p.z] as [number, number])
  })

  function retainingClick(plan: { x: number; z: number }) {
    if (activeStoreyIndex !== 0) {
      errorMessage = 'A retaining wall stands on the ground. Switch to the ground floor to draw it.'
      return
    }
    const at = retainingSnap(plan).point
    const last = retainingDraft.at(-1)
    // A second click on the point just placed (a double-click) adds nothing.
    if (last && Math.hypot(last.x - at.x, last.z - at.z) < 0.02) return
    retainingDraft = [...retainingDraft, at]
  }

  function finishRetaining() {
    if (tool !== 'draw-retaining' || retainingDraft.length < 2) return
    if (applyResult(documentStore.addRetainingWall({ type: retainingType, points: retainingDraft.map((p) => [p.x, p.z]) }))) {
      const added = documentStore.document.retaining?.at(-1)
      retainingDraft = []
      if (added) chooseSelection({ retaining: added.id })
    }
  }

  $effect(() => {
    if (tool !== 'draw-retaining') return
    const onKey = (event: KeyboardEvent) => {
      if (typingTarget(event)) return
      if (event.key === 'Enter') {
        event.preventDefault()
        finishRetaining()
      } else if (event.key === 'Backspace' && retainingDraft.length > 0) {
        event.preventDefault()
        retainingDraft = retainingDraft.slice(0, -1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const chosenRetaining = $derived.by(() => {
    const wall = selectedRetaining ? document.retaining?.find((item) => item.id === selectedRetaining) : undefined
    return wall && planGround ? { wall, measure: measureRetaining(wall, planGround) } : null
  })

  function removeChosenRetaining() {
    if (chosenRetaining && applyResult(documentStore.removeRetainingWall(chosenRetaining.wall.id))) chooseSelection({})
  }

  // A carport being placed follows the pointer, square to the drawing grid; R turns it a quarter turn.
  const carportGhost = $derived.by((): { carport: Omit<Carport, 'id'>; problem: string | null } | null => {
    const at = pointerPlan
    if (tool !== 'draw-carport' || !at) return null
    const length = Math.hypot(pavingAxis.x, pavingAxis.z) || 1
    let dir = { x: pavingAxis.x / length, z: pavingAxis.z / length }
    for (let i = 0; i < ((carportTurn % 4) + 4) % 4; i++) dir = { x: -dir.z, z: dir.x }
    const loose = { x: at.x, z: at.z, dx: dir.x, dz: dir.z, bays: carportBays, roof: carportRoof }
    const carport = { ...loose, ...snapCarport(document, loose, s(0.4)) }
    return { carport, problem: carportProblem(document, carport) }
  })

  function placeCarport() {
    if (activeStoreyIndex !== 0) {
      errorMessage = 'A carport stands on the ground. Switch to the ground floor to place it.'
      return
    }
    const ghost = carportGhost
    if (!ghost) return
    if (applyResult(documentStore.addCarport(ghost.carport))) {
      const added = documentStore.document.carports?.at(-1)
      if (added) chooseSelection({ carport: added.id })
    }
  }

  const carportWarnings = $derived(carportIssues(document))
  const chosenCarport = $derived(selectedCarport ? (document.carports?.find((item) => item.id === selectedCarport) ?? null) : null)

  function removeChosenCarport() {
    const chosen = chosenCarport
    if (chosen && applyResult(documentStore.removeCarport(chosen.id))) chooseSelection({})
  }

  function turnChosenCarport() {
    const chosen = chosenCarport
    if (chosen) applyResult(documentStore.updateCarport(chosen.id, { dx: -chosen.dz, dz: chosen.dx }))
  }

  $effect(() => {
    if (tool !== 'draw-carport') return
    const onKey = (event: KeyboardEvent) => {
      if (typingTarget(event) || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'r' || event.key === 'R') {
        event.preventDefault()
        carportTurn += 1
      } else if (event.key === '-' || event.key === '_' || event.key === '+' || event.key === '=') {
        event.preventDefault()
        const step = event.key === '-' || event.key === '_' ? -1 : 1
        carportBays = Math.min(3, Math.max(1, carportBays + step)) as Carport['bays']
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // The paving picked: one area, or the apron, which is a project setting.
  const chosenPaving = $derived.by(() => {
    const id = selectedPaving
    if (!id) return null
    if (id === 'apron') {
      const piece = pavingPieces(document).filter((item) => item.apron)
      if (piece.length === 0) return null
      return { apron: true as const, area: piece.reduce((sum, item) => sum + item.area, 0) }
    }
    const item = document.paving?.find((entry) => entry.id === id)
    const piece = pavingPieces(document).find((entry) => entry.id === id)
    return item && piece ? { apron: false as const, item, area: piece.area } : null
  })

  function removeChosenPaving() {
    const chosen = chosenPaving
    if (!chosen) return
    if (chosen.apron) applyResult(documentStore.setProjectDefaults({ apronWidth: 0 }))
    else applyResult(documentStore.removePaving(chosen.item.id))
    chooseSelection({})
  }

  function placeFixtureAt(plan: { x: number; z: number }) {
    pointerPlan = plan
    const ghost = fixtureGhost
    if (!ghost) return
    if (ghost.placement.problem) {
      errorMessage = ghost.placement.problem
      return
    }
    applyResult(documentStore.addFixture(ghost.floorId, ghost.placement.fixture))
  }




  $effect(() => {
    if (tool !== 'draw-fixture') return
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || typingTarget(event)) return
      if (event.key === '-' || event.key === '_' || event.key === '+' || event.key === '=') {
        if (!placeSize) return
        event.preventDefault()
        stepPlaceSize(event.key === '-' || event.key === '_' ? -1 : 1)
        return
      }
      if (event.key !== 'r' && event.key !== 'R') return
      event.preventDefault()
      fixtureTurn += 1
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function removeChosenFixture() {
    const chosen = chosenFixture
    if (!chosen) return
    if (applyResult(documentStore.removeFixture(chosen.floorId, chosen.fixture.id))) chooseSelection({})
  }


  function suggestForSelectedRoom() {
    const chosen = selectedRoom
    if (!chosen?.resolved) return
    const floor = floors.find((item) => item.id === chosen.floorId)
    if (!floor) return
    const cells = floorCells(floor)
    const drafts = chosen.resolved.cells.flatMap((cell) => {
      const own = cells.find((item) => roomKey(item.room.cornerIds) === roomKey(cell.room.cornerIds)) ?? cell
      return suggestRoomFixtures(document, floor, own, chosen.resolved!.space.type, cells)
    })
    const ok = applyResult(documentStore.addFixtures(floor.id, drafts))
    if (ok) errorMessage = null
  }

  const selectedRoomFixtures = $derived.by(() => {
    const chosen = selectedRoom
    if (!chosen?.resolved) return 0
    return levelFixtures.filter(
      (item) => item.floorId === chosen.floorId && chosen.resolved!.cells.some((cell) => pointInRing(cell.ring, item.fixture.x, item.fixture.z)),
    ).length
  })

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
    if (selectedService && selectedBend !== null) return { label: 'Delete bend', run: removeSelectedBend }
    if (chosenFixture) return { label: `Delete ${chosenFixture.spec.name.toLowerCase()}`, run: removeChosenFixture }
    if (chosenPaving) return { label: chosenPaving.apron ? 'Remove the apron' : 'Delete paving', run: removeChosenPaving }
    if (chosenCarport) return { label: 'Delete carport', run: removeChosenCarport }
    if (chosenCounter) return { label: 'Delete counter', run: removeChosenCounter }
    if (chosenRetaining) return { label: 'Delete retaining wall', run: removeChosenRetaining }
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

  // While the plan is open, the menubar can reach its tools, its zoom and what Delete would remove.
  $effect(() =>
    workspace.openPlan({
      tool: () => (tool === 'draw-rect' ? 'draw-double' : tool),
      setTool: (next) => setTool(next as Tool),
      zoomBy,
      fit: fitView,
      deletable: () => deletable,
    }),
  )

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
    if (tool === 'draw-retaining') {
      const name = retainingSpec(retainingType).name
      if (retainingDraft.length === 0) return `${name}. Click along the foot of the bank it is to hold, point by point. What it holds is read from the ground.`
      if (retainingDraft.length === 1) return 'Click the next point. Backspace takes the last one back; Esc starts again.'
      return 'Click on, or click Finish, double-click or press Enter to build the wall.'
    }
    if (tool === 'draw-counter') {
      const spec = counterKindSpec(counterKind)
      if (!counterStart) {
        return counterKind === 'base'
          ? `${spec.name}, ${spec.depth * 1000} mm deep. Click on the inside face of a wall where it starts.`
          : `${spec.name}. Click one corner, then the opposite one.`
      }
      const draft = counterDraft
      if (!draft) return 'Click where it ends. Esc to start again.'
      const size = `${Math.round(draft.counter.length * 1000)} × ${Math.round(draft.counter.depth * 1000)} mm`
      return draft.problem ? `${size}: ${draft.problem}.` : `${size}. Click to set it. Esc to start again.`
    }
    if (tool === 'draw-carport') {
      const ghost = carportGhost
      const size = carportSize({ bays: carportBays })
      const name = `${carportName(carportBays)}, ${size.wide.toFixed(2)} × ${size.deep.toFixed(1)} m, ${carportRoofSpec(carportRoof).name.toLowerCase()}`
      if (ghost?.problem) return `${name}. It will not go here: ${ghost.problem}.`
      return `${name}. Click to place it; R turns it, − and + change how many cars it takes. Esc when done.`
    }
    if (tool === 'draw-paving') {
      const spec = PAVING[pavingSurface]
      if (pavingShape === 'rect') {
        return pavingDraft.length === 0
          ? `${spec.name} paving. Click one corner, then the opposite one; corners snap to the plot, the house and other paving.`
          : 'Click the opposite corner. Esc to start again.'
      }
      if (pavingDraft.length === 0) return `${spec.name} paving. Click each corner of the area in turn; corners snap to the plot, the house and other paving.`
      if (pavingDraft.length < 3) return `${pavingDraft.length} of at least 3 corners. Backspace takes the last one back; Esc starts again.`
      return pavingCloses ? 'Click to close the outline and lay the paving.' : 'Click Finish, double-click, press Enter or click the first corner to lay the paving.'
    }
    if (tool === 'draw-fixture') {
      const ghost = fixtureGhost
      const spec = fixtureSpec(fixtureKind)
      if (!ghost) return `${spec.name}: ${spec.text}`
      if (ghost.placement.problem) return `${spec.name}. ${ghost.placement.problem}`
      const height = spec.mount === 'ceiling' ? '' : ` ${Math.round(ghost.placement.fixture.y * 1000)} mm up.`
      return `${spec.name}.${height} Click to place; Esc when done.`
    }
    if (tool === 'draw-stair') {
      const ghost = stairGhost
      if (!ghost) return 'Point inside a room to place a stair. It needs a storey above it.'
      const { layout } = ghost.placement
      const size = `${layout.risers} risers of ${Math.round(layout.riser * 1000)} mm, ${checkFormat.format(layout.length)} m by ${Math.round(ghost.placement.stair.width * 1000)} mm.`
      if (ghost.placement.problem) return `${stairProblemText(ghost.placement.problem)} ${size}`
      const against =
        ghost.placement.snap === 'side'
          ? ' Its side is against the wall.'
          : ghost.placement.snap === 'end'
            ? ' Its end is against the wall.'
            : ''
      return `${size}${against} Click to place, R to turn it.`
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
    if (activeStoreyIndex > 0) {
      const floating = levelFloors.find((floor) => !(floor.outline ?? []).some((ring) => ring.length >= 3))
      if (floating?.roof) {
        return 'This roof has nothing to stand on. Enclose rooms on the storey below, with solid or logical walls.'
      }
      if (floating) return 'Nothing is enclosed on the storey below, so this storey has no floor to stand on.'
    }
    const levelIds = new Set(levelFloors.map((floor) => floor.id))
    const wiringProblem = wiringProblems.find((issue) => !issue.floorId || levelIds.has(issue.floorId))
    if (wiringProblem && levelFixtures.length > 0) return wiringProblem.text
    if (activeStoreyIndex === 0 && plumbing.issues[0]) return plumbing.issues[0].text
    if (activeStoreyIndex > 0 && unlandedWallIds.size > 0) {
      return 'A wall on this storey does not land on a wall below. A logical wall below can carry it.'
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
  <div class="flex flex-wrap items-center gap-2 border-b bg-background px-2 py-1.5 sm:gap-3 sm:px-3" class:hidden={documentStore.readOnly}>
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
      <ToggleGroup.Item value="draw-fixture" aria-label="Fittings" title="Fittings: sockets, lights, toilets, basins and more" class="max-sm:px-2">
        <Plug /><span class="hidden sm:inline">Fittings</span>
      </ToggleGroup.Item>
      <ToggleGroup.Item value="draw-paving" aria-label="Paving" title="Paving: driveways, paths and patios on the ground" class="max-sm:px-2">
        <Grid2x2 /><span class="hidden sm:inline">Paving</span>
      </ToggleGroup.Item>
      <ToggleGroup.Item value="draw-carport" aria-label="Carport" title="Carport: a roof on posts, standing free" class="max-sm:px-2">
        <CarFront /><span class="hidden sm:inline">Carport</span>
      </ToggleGroup.Item>
      <ToggleGroup.Item value="draw-retaining" aria-label="Retaining wall" title="Retaining wall: holds a bank back" class="max-sm:px-2">
        <Mountain /><span class="hidden sm:inline">Retaining</span>
      </ToggleGroup.Item>
      <ToggleGroup.Item value="draw-counter" aria-label="Counters" title="Counters: kitchen cupboards and worktops" class="max-sm:px-2">
        <ChefHat /><span class="hidden sm:inline">Counters</span>
      </ToggleGroup.Item>
    </ToggleGroup.Root>
    {#if focusedCells}
      <Button size="sm" variant="outline" title="Back to the whole plan" onclick={leaveRoom}>
        <Maximize2 />{focusedCells.name}: whole plan
      </Button>
    {/if}
    {#if tool === 'draw-retaining'}
      <Select.Root type="single" value={retainingType} onValueChange={(next) => next && (retainingType = next as RetainingType)}>
        <Select.Trigger size="sm" class="w-44" aria-label="Kind of retaining wall">{retainingSpec(retainingType).name}</Select.Trigger>
        <Select.Content>
          {#each RETAINING_TYPES as spec (spec.id)}
            <Select.Item value={spec.id} label={spec.name} />
          {/each}
        </Select.Content>
      </Select.Root>
      {#if retainingDraft.length > 0}
        <Button size="sm" disabled={retainingDraft.length < 2} title="Build the wall (Enter)" onclick={finishRetaining}>
          <Check />Finish
        </Button>
      {/if}
    {/if}
    {#if tool === 'draw-counter'}
      <ToggleGroup.Root
        type="single"
        variant="outline"
        size="sm"
        value={counterKind}
        onValueChange={(next) => {
          if (next) {
            counterKind = next as CounterKind
            counterStart = null
          }
        }}
        aria-label="Kind of counter"
      >
        {#each COUNTER_KINDS as spec (spec.id)}
          <ToggleGroup.Item value={spec.id} title={spec.text}>{spec.name}</ToggleGroup.Item>
        {/each}
      </ToggleGroup.Root>
      <Select.Root type="single" value={counterTop} onValueChange={(next) => next && (counterTop = next as CounterTop)}>
        <Select.Trigger size="sm" class="w-36" aria-label="Worktop">
          <span class="flex items-center gap-2">
            <span class="inline-block size-4 shrink-0 rounded-sm border border-black/15" style:background={counterTopSpec(counterTop).colour}></span>
            {counterTopSpec(counterTop).name}
          </span>
        </Select.Trigger>
        <Select.Content>
          {#each COUNTER_TOPS as spec (spec.id)}
            <Select.Item value={spec.id} label={spec.name}>
              <span class="inline-block size-4 shrink-0 rounded-sm border border-black/15" style:background={spec.colour}></span>
              {spec.name}
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    {/if}
    {#if tool === 'draw-carport'}
      <ToggleGroup.Root
        type="single"
        variant="outline"
        size="sm"
        value={String(carportBays)}
        onValueChange={(next) => next && (carportBays = Number(next) as Carport['bays'])}
        aria-label="How many cars"
      >
        {#each CARPORT_BAYS as bays (bays)}
          <ToggleGroup.Item value={String(bays)} title={carportName(bays)}>{bays === 1 ? 'Single' : bays === 2 ? 'Double' : 'Triple'}</ToggleGroup.Item>
        {/each}
      </ToggleGroup.Root>
      <Select.Root type="single" value={carportRoof} onValueChange={(next) => next && (carportRoof = next as CarportRoof)}>
        <Select.Trigger size="sm" class="w-40" aria-label="Carport roof">{carportRoofSpec(carportRoof).name}</Select.Trigger>
        <Select.Content>
          {#each CARPORT_ROOFS as spec (spec.id)}
            <Select.Item value={spec.id} label={spec.name} />
          {/each}
        </Select.Content>
      </Select.Root>
      <Button size="sm" variant="outline" title="Turn it a quarter turn (R)" onclick={() => (carportTurn += 1)}>
        <RotateCw /><span class="hidden sm:inline">Turn</span>
      </Button>
    {/if}
    {#if tool === 'draw-paving'}
      <ToggleGroup.Root
        type="single"
        variant="outline"
        size="sm"
        value={pavingShape}
        onValueChange={(next) => {
          if (next) {
            pavingShape = next as 'rect' | 'outline'
            pavingDraft = []
          }
        }}
        aria-label="Paving shape"
      >
        <ToggleGroup.Item value="rect" title="Two opposite corners">Rectangle</ToggleGroup.Item>
        <ToggleGroup.Item value="outline" title="Each corner in turn">Outline</ToggleGroup.Item>
      </ToggleGroup.Root>
      <Select.Root type="single" value={pavingSurface} onValueChange={(next) => next && (pavingSurface = next as PavingSurface)}>
        <Select.Trigger size="sm" class="w-40" aria-label="Paving surface">
          <span class="flex items-center gap-2">
            <span class="inline-block size-4 shrink-0 rounded-sm border border-black/15" style:background={pavingSwatch(pavingSurface)}></span>
            {PAVING[pavingSurface].name}
          </span>
        </Select.Trigger>
        <Select.Content>
          {#each PAVING_LIST as spec (spec.id)}
            <Select.Item value={spec.id} label={spec.name}>
              <span class="inline-block size-4 shrink-0 rounded-sm border border-black/15" style:background={pavingSwatch(spec.id)}></span>
              {spec.name}
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
      {#if pavingShape === 'outline' && pavingDraft.length > 0}
        <Button size="sm" disabled={pavingDraft.length < 3} title="Lay the paving (Enter)" onclick={finishPavingOutline}>
          <Check />Finish
        </Button>
        <Button size="sm" variant="outline" title="Take back the last corner (Backspace)" onclick={undoPavingCorner}>
          <Undo2 /><span class="hidden sm:inline">Corner</span>
        </Button>
      {/if}
    {/if}
    {#if tool === 'draw-fixture'}
      <Select.Root type="single" value={fixtureKind} onValueChange={(next) => (fixtureKind = next as FixtureKind)}>
        <Select.Trigger size="sm" class="w-44" aria-label="Fitting">{fixtureSpec(fixtureKind).name}</Select.Trigger>
        <Select.Content>
          <Select.Group>
            <Select.Label>Electrical</Select.Label>
            {#each FIXTURES.filter((item) => item.trade === 'electrical') as option (option.id)}
              <Select.Item value={option.id} label={option.name} />
            {/each}
          </Select.Group>
          <Select.Group>
            <Select.Label>Plumbing</Select.Label>
            {#each FIXTURES.filter((item) => item.trade === 'plumbing') as option (option.id)}
              <Select.Item value={option.id} label={option.name} />
            {/each}
          </Select.Group>
          <Select.Group>
            <Select.Label>Gas</Select.Label>
            {#each FIXTURES.filter((item) => item.trade === 'gas') as option (option.id)}
              <Select.Item value={option.id} label={option.name} />
            {/each}
          </Select.Group>
        </Select.Content>
      </Select.Root>
      {#if placeSize}
        <div class="flex items-center gap-1" role="group" aria-label="Size">
          <Button variant="outline" size="icon-sm" title="Smaller (−)" aria-label="Smaller" onclick={() => stepPlaceSize(-1)}><Minus /></Button>
          <span class="min-w-16 text-center text-sm tabular-nums">{placeSize.name}</span>
          <Button variant="outline" size="icon-sm" title="Bigger (+)" aria-label="Bigger" onclick={() => stepPlaceSize(1)}><Plus /></Button>
        </div>
      {/if}
    {/if}
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
        class="shrink-0 {documentStore.readOnly ? 'hidden' : ''}"
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
        <Button variant="ghost" size="sm" class="shrink-0 text-muted-foreground {documentStore.readOnly ? 'hidden' : ''}" onclick={removeStorey}>
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
    class="canvas paper"
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
      {#each FLOOR_FINISHES as spec (spec.id)}
        {@const tile = spec.module}
        {#if tile}
          {@const rows = tile.staggered ? 2 : 1}
          <pattern id="floor-{spec.id}" patternUnits="userSpaceOnUse" width={tile.along} height={tile.across * rows}>
            <rect width={tile.along} height={tile.across * rows} fill={spec.colour} fill-opacity="0.4" />
            <path
              d={tile.staggered
                ? `M0 0H${tile.along}M0 ${tile.across}H${tile.along}M0 0V${tile.across}M${tile.along / 2} ${tile.across}V${tile.across * 2}`
                : `M0 0H${tile.along}M0 0V${tile.across}`}
              fill="none"
              stroke={spec.joint}
              stroke-opacity="0.55"
              stroke-width="0.012"
            />
          </pattern>
        {:else if spec.id === 'carpet'}
          <pattern id="floor-carpet" patternUnits="userSpaceOnUse" width="0.16" height="0.16">
            <rect width="0.16" height="0.16" fill={spec.colour} fill-opacity="0.32" />
            <circle cx="0.04" cy="0.04" r="0.014" fill={spec.joint} fill-opacity="0.5" />
            <circle cx="0.12" cy="0.12" r="0.014" fill={spec.joint} fill-opacity="0.5" />
          </pattern>
        {:else}
          <pattern id="floor-{spec.id}" patternUnits="userSpaceOnUse" width="1" height="1">
            <rect width="1" height="1" fill={spec.colour} fill-opacity="0.3" />
          </pattern>
        {/if}
      {/each}
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
    <g class="roads" pointer-events="none">
      <!-- In layers, so where roads meet each one's tar covers the other's verge. -->
      {#each roads as strip (strip.edge)}
        <polygon points={pointsAttr(strip.verge.map((p) => [p.x, p.z] as SvgPoint))} class="verge" />
      {/each}
      {#each roads as strip (strip.edge)}
        <polygon points={pointsAttr(strip.road.map((p) => [p.x, p.z] as SvgPoint))} class="carriageway" />
      {/each}
      {#each centreDashes(roads) as [a, b], i (i)}
        <line x1={a.x} y1={a.z} x2={b.x} y2={b.z} class="centre-line" stroke-width={0.12} />
      {/each}
    </g>
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
    {#if activeStoreyIndex === 0}
      <g class="retaining" pointer-events="none">
        {#each document.retaining ?? [] as wall (wall.id)}
          {@const picked = selectedRetaining === wall.id}
          <polyline
            points={pointsAttr(wall.points.map(([x, z]) => [x, z] as SvgPoint))}
            fill="none"
            stroke={picked ? '#2563eb' : retainingSpec(wall.type).colour}
            stroke-width={retainingSpec(wall.type).thickness}
            stroke-linejoin="round"
          />
          <polyline points={pointsAttr(wall.points.map(([x, z]) => [x, z] as SvgPoint))} fill="none" stroke={picked ? '#1d4ed8' : '#44403c'} stroke-width={s(0.02)} />
          <!-- Ticks on the downhill side, the way the ground falls away from the wall. -->
          {#if planGround}
            {#each retainingSamples(wall, planGround).filter((_, i) => i % 2 === 0) as sample, i (i)}
              <line
                x1={sample.x}
                y1={sample.z}
                x2={sample.x + sample.down.x * 0.45}
                y2={sample.z + sample.down.z * 0.45}
                stroke={picked ? '#1d4ed8' : '#44403c'}
                stroke-width={s(0.02)}
              />
            {/each}
          {/if}
        {/each}
        {#if retainingPreview.length >= 2}
          <polyline
            points={pointsAttr(retainingPreview.map(([x, z]) => [x, z] as SvgPoint))}
            fill="none"
            stroke="#2563eb"
            stroke-width={s(0.05)}
            stroke-dasharray={dash(0.2, 0.12)}
          />
        {/if}
        {#if tool === 'draw-retaining'}
          {#each retainingDraft as point, i (i)}
            <circle cx={point.x} cy={point.z} r={s(0.1)} fill="#ffffff" stroke="#2563eb" stroke-width={s(0.04)} />
          {/each}
          {#if retainingGuide}
            <circle cx={retainingGuide.point.x} cy={retainingGuide.point.z} r={s(0.12)} fill="#2563eb" />
          {/if}
        {/if}
      </g>
    {/if}
    {#snippet carportShape(carport: Omit<Carport, 'id'>, state: 'placed' | 'picked' | 'ghost' | 'refused')}
      {@const ring = carportRing(carport)}
      {@const colour = state === 'refused' ? '#dc2626' : state === 'placed' ? '#57534e' : '#2563eb'}
      <polygon
        points={pointsAttr(ring.map((p) => [p.x, p.z] as SvgPoint))}
        fill={carportRoofSpec(carport.roof).colour}
        fill-opacity={state === 'ghost' || state === 'refused' ? 0.3 : 0.38}
        stroke={colour}
        stroke-width={s(state === 'placed' ? 0.03 : 0.06)}
        stroke-dasharray={dash(0.3, 0.16)}
      />
      <!-- A diagonal each way marks it as a roof with nothing under it; the way in is the open side. -->
      <path
        d="M {ring[0].x} {ring[0].z} L {ring[2].x} {ring[2].z} M {ring[1].x} {ring[1].z} L {ring[3].x} {ring[3].z}"
        stroke={colour}
        stroke-opacity="0.35"
        stroke-width={s(0.02)}
        fill="none"
      />
      {#each carportPosts(carport) as post, i (i)}
        <rect x={post.x - 0.06} y={post.z - 0.06} width="0.12" height="0.12" fill={colour} />
      {/each}
    {/snippet}
    {#if activeStoreyIndex === 0}
      <g class="carports" pointer-events="none">
        {#each document.carports ?? [] as carport (carport.id)}
          {#if carportMove?.id === carport.id && carportMove.preview}
            {@render carportShape(carportMove.preview, carportMove.problem ? 'refused' : 'picked')}
          {:else}
            {@render carportShape(carport, selectedCarport === carport.id ? 'picked' : 'placed')}
          {/if}
        {/each}
        {#if carportGhost}
          {@render carportShape(carportGhost.carport, carportGhost.problem ? 'refused' : 'ghost')}
        {/if}
      </g>
    {/if}
    {#if activeStoreyIndex === 0}
      <g class="paving" pointer-events="none">
        {#each apronPolygons(document) as polygon, i (i)}
          <path
            d={[polygon.outer, ...polygon.holes].map((ring) => `M ${ring.map((p) => `${p.x} ${p.z}`).join(' L ')} Z`).join(' ')}
            fill-rule="evenodd"
            fill={PAVING[projectDefaults(document).apronSurface].colour}
            fill-opacity="0.55"
            stroke={selectedPaving === 'apron' ? '#2563eb' : 'none'}
            stroke-width={s(0.05)}
          />
        {/each}
        {#each document.paving ?? [] as area (area.id)}
          <polygon
            points={pointsAttr(area.ring.map(([x, z]) => [x, z] as SvgPoint))}
            fill={PAVING[area.surface].colour}
            fill-opacity="0.7"
            stroke={selectedPaving === area.id ? '#2563eb' : '#57534e'}
            stroke-width={s(selectedPaving === area.id ? 0.06 : 0.02)}
          />
        {/each}
        {#if pavingPreview.length >= 2}
          <polygon
            points={pointsAttr(pavingPreview.map(([x, z]) => [x, z] as SvgPoint))}
            fill={PAVING[pavingSurface].colour}
            fill-opacity="0.45"
            stroke="#2563eb"
            stroke-width={s(0.04)}
            stroke-dasharray="{s(0.2)} {s(0.12)}"
          />
        {/if}
        {#if tool === 'draw-paving'}
          {#each pavingDraft as corner, i (i)}
            <circle
              cx={corner.x}
              cy={corner.z}
              r={s(i === 0 && pavingShape === 'outline' && pavingDraft.length >= 3 ? (pavingCloses ? 0.28 : 0.2) : 0.1)}
              fill={i === 0 && pavingCloses ? '#2563eb' : '#ffffff'}
              stroke="#2563eb"
              stroke-width={s(0.04)}
            />
          {/each}
          {#if pavingPoint && !pavingCloses}
            <circle cx={pavingPoint.x} cy={pavingPoint.z} r={s(0.12)} fill="#2563eb" />
          {/if}
        {/if}
      </g>
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
    {#if guideTraces.length > 0}
      {#each guideTraces as trace, i (i)}
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
          {#if cellChosen(room.cornerIds)}
            <polygon points={pointsAttr(pts)} fill="rgba(37, 99, 235, 0.14)" stroke="none" pointer-events="none" />
          {/if}
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
        {#if stairGhost}
          {@const ghost = stairGhost.placement}
          {@const top = { x: ghost.stair.x + ghost.stair.dx * ghost.layout.length, z: ghost.stair.z + ghost.stair.dz * ghost.layout.length }}
          <polygon
            points={pointsAttr(ghost.layout.footprint.map((p) => [p.x, p.z] as SvgPoint))}
            class="stair-flight preview"
            class:invalid={ghost.problem !== null}
          />
          {#each ghost.layout.nosings as line, i (i)}
            <line x1={line.a.x} y1={line.a.z} x2={line.b.x} y2={line.b.z} class="stair-nosing" />
          {/each}
          <polyline
            points={pointsAttr([
              [ghost.stair.x, ghost.stair.z],
              [top.x, top.z],
            ])}
            class="stair-arrow"
          />
          <polyline
            points={pointsAttr([
              [top.x - ghost.stair.dx * 0.3 - ghost.stair.dz * 0.14, top.z - ghost.stair.dz * 0.3 + ghost.stair.dx * 0.14],
              [top.x, top.z],
              [top.x - ghost.stair.dx * 0.3 + ghost.stair.dz * 0.14, top.z - ghost.stair.dz * 0.3 - ghost.stair.dx * 0.14],
            ])}
            class="stair-arrow"
          />
        {/if}
      </g>
      <g class="circuits" pointer-events="none">
        {#each shownCircuits as circuit (circuit.id)}
          {@const points = circuitLines(circuit)}
          {#if points.length > 1}
            <polyline points={pointsAttr(points)} fill="none" stroke="#d97706" stroke-width={s(0.02)} stroke-dasharray={dash(0.15, 0.1)} />
          {/if}
        {/each}
      </g>
      <g class="downpipes" pointer-events="none">
        {#each shownDownpipes as pipe, i (i)}
          {#if pipe.tank}
            <line x1={pipe.x} y1={pipe.z} x2={pipe.tank.x} y2={pipe.tank.z} class="downpipe-lead" stroke-width={s(0.05)} />
          {/if}
          <circle cx={pipe.x} cy={pipe.z} r={s(0.09)} class="downpipe" class:linked={pipe.tank} stroke-width={s(0.02)} />
        {/each}
      </g>
      <g class="gas" pointer-events="none">
        {#each gasLines as line (line.id)}
          <polyline
            points={pointsAttr(line.path.map((p) => [p.x, p.z] as SvgPoint))}
            fill="none"
            class="service-line gas"
            class:chosen={line.chosen}
            stroke-width={s(line.chosen ? 0.05 : 0.03)}
          />
        {/each}
      </g>
      {#if showServices}
        <g class="services" pointer-events="none">
          {#each [['water', waterPath], ['sewer', sewerPath]] as [kind, path] (kind)}
            {@const points = path as { x: number; z: number }[]}
            {@const chosen = selectedService === kind}
            {#if points.length > 1 && (kind === 'water' || plumbing.drains.length > 0)}
              <polyline
                points={pointsAttr(points.map((p) => [p.x, p.z] as SvgPoint))}
                fill="none"
                class="service-line {kind}"
                class:chosen
                stroke-width={s(chosen ? 0.06 : 0.04)}
              />
              {@const end = points.at(-1)!}
              {#if kind === 'sewer' && soakaway}
                <line x1={end.x} y1={end.z} x2={soakaway.x} y2={soakaway.z} class="service-line sewer overflow" stroke-width={s(0.03)} />
                <rect x={soakaway.x - 1.5} y={soakaway.z - 0.5} width={3} height={1} class="service-mark soakaway" stroke-width={s(0.03)} />
                <rect x={end.x - 1.2} y={end.z - 0.7} width={2.4} height={1.4} rx={0.1} class="service-mark septic" stroke-width={s(0.03)} />
              {:else if kind === 'sewer'}
                <circle cx={end.x} cy={end.z} r={s(0.3)} class="service-mark sewer" stroke-width={s(0.03)} />
              {:else}
                <rect x={end.x - s(0.25)} y={end.z - s(0.25)} width={s(0.5)} height={s(0.5)} class="service-mark water" stroke-width={s(0.03)} />
              {/if}
              {#if chosen}
                {#each points.slice(1, -1) as bend, i (i)}
                  <circle cx={bend.x} cy={bend.z} r={s(0.14)} class="service-handle" class:active={selectedBend === i} stroke-width={s(0.025)} />
                {/each}
                {#each points.slice(1) as point, i (i)}
                  {@const mid = { x: (points[i].x + point.x) / 2, z: (points[i].z + point.z) / 2 }}
                  <g transform={upright(mid.x, mid.z)}>
                    <circle r={s(0.11)} class="service-add" stroke-width={s(0.02)} />
                    <line x1={-s(0.06)} x2={s(0.06)} stroke-width={s(0.02)} class="service-add-mark" />
                    <line y1={-s(0.06)} y2={s(0.06)} stroke-width={s(0.02)} class="service-add-mark" />
                  </g>
                {/each}
              {/if}
            {/if}
          {/each}
          {#if plumbing.exit}
            <circle cx={plumbing.exit.x} cy={plumbing.exit.z} r={s(0.1)} class="service-exit" />
          {/if}
          {#if selectedService === 'sewer' && sewerProfile}
            {#each sewerProfile.points as point, i (i)}
              <text transform={upright(point.x, point.z)} x={s(0.3)} y={-s(0.2)} font-size={s(0.32)} class="service-depth" class:short={i === sewerProfile.points.length - 1 && sewerProfile.shortBy > 0.005}>
                {Math.round((point.ground - point.invert) * 1000)} deep
              </text>
            {/each}
          {/if}
        </g>
      {/if}
      {#if changesHere}
        <!-- Against the house as built: new wall in green, wall taken down in dashed red, openings cut and closed. -->
        <g class="changes" pointer-events="none">
          {#each changesHere.demolished as piece, i (i)}
            <line x1={piece.a.x} y1={piece.a.z} x2={piece.b.x} y2={piece.b.z} stroke="#fecaca" stroke-opacity="0.7" stroke-width={piece.thickness} />
            <line x1={piece.a.x} y1={piece.a.z} x2={piece.b.x} y2={piece.b.z} stroke="#dc2626" stroke-width={s(0.035)} stroke-dasharray={dash(0.18, 0.12)} />
          {/each}
          {#each changesHere.built as piece, i (i)}
            <line x1={piece.a.x} y1={piece.a.z} x2={piece.b.x} y2={piece.b.z} stroke="#16a34a" stroke-opacity="0.75" stroke-width={piece.thickness} />
          {/each}
          {#each changesHere.cut as opening, i (i)}
            <circle cx={opening.at.x} cy={opening.at.z} r={s(0.16)} fill="#16a34a" stroke="#ffffff" stroke-width={s(0.03)} />
          {/each}
          {#each changesHere.closed as opening, i (i)}
            <circle cx={opening.at.x} cy={opening.at.z} r={s(0.16)} fill="#dc2626" stroke="#ffffff" stroke-width={s(0.03)} />
          {/each}
        </g>
      {/if}
      <g class="fixtures" pointer-events="none">
        {#each levelFixtures as item (item.fixture.id)}
          {@const shown = fixtureMove?.id === item.fixture.id && fixtureMove.preview ? fixtureMove.preview : item.fixture}
          {#if !counterUnder(activeFloor?.counters, shown.x, shown.z)}
            <FixtureSymbol fixture={shown} chosen={selectedFixture?.id === item.fixture.id} line={s(0.012)} />
          {/if}
        {/each}
        {#if fixtureGhost}
          <FixtureSymbol fixture={{ ...fixtureGhost.placement.fixture, id: 'ghost' }} ghost invalid={fixtureGhost.placement.problem !== null} line={s(0.012)} />
        {/if}
      </g>
    {#snippet counterShape(counter: Omit<Counter, 'id'>, state: 'set' | 'picked' | 'draft' | 'refused')}
      {@const ring = counterRing(counter)}
      {@const colour = state === 'refused' ? '#dc2626' : state === 'set' ? '#44403c' : '#2563eb'}
      <polygon
        points={pointsAttr(ring.map((p) => [p.x, p.z] as SvgPoint))}
        fill={counterTopSpec(counter.top).colour}
        fill-opacity={state === 'draft' || state === 'refused' ? 0.55 : 0.92}
        stroke={colour}
        stroke-width={s(state === 'set' ? 0.02 : 0.045)}
      />
      {#if counter.wallUnits}
        <!-- Cupboards on the wall above: a dashed line 350 mm out from the wall. -->
        {@const back = counterRing({ ...counter, depth: 0.35 })}
        <line x1={back[3].x} y1={back[3].z} x2={back[2].x} y2={back[2].z} stroke={colour} stroke-width={s(0.015)} stroke-dasharray={dash(0.1, 0.07)} />
      {/if}
    {/snippet}
    <g class="counters" pointer-events="none">
      {#each activeFloor?.counters ?? [] as counter (counter.id)}
        {@render counterShape(counterMove?.id === counter.id && counterMove.preview ? counterMove.preview : counter, selectedCounter === counter.id ? 'picked' : 'set')}
      {/each}
      {#if counterDraft && counterDraft.counter.length > 0}
        {@render counterShape(counterDraft.counter, counterDraft.problem ? 'refused' : 'draft')}
      {/if}
      {#if tool === 'draw-counter'}
        {@const mark = counterStart ?? counterHover}
        {#if mark && (mark.face || counterKind !== 'base')}
          <circle cx={mark.point.x} cy={mark.point.z} r={s(0.09)} fill="#2563eb" />
        {/if}
      {/if}
    </g>
    <!-- A sink or a hob set into a counter is drawn over it. -->
    <g class="fixtures set-in" pointer-events="none">
      {#each levelFixtures as item (item.fixture.id)}
        {@const shown = fixtureMove?.id === item.fixture.id && fixtureMove.preview ? fixtureMove.preview : item.fixture}
        {#if counterUnder(activeFloor?.counters, shown.x, shown.z)}
          <FixtureSymbol fixture={shown} chosen={selectedFixture?.id === item.fixture.id} line={s(0.012)} />
        {/if}
      {/each}
    </g>
    {#if focusedCells}
      <!-- Everything outside the room being laid out is veiled, so the room reads on its own. -->
      <path
        d="M -1000 -1000 H 2000 V 2000 H -1000 Z {focusedCells.rings.map((ring) => `M ${ring.map((p) => `${p.x} ${p.z}`).join(' L ')} Z`).join(' ')}"
        fill="var(--background)"
        fill-opacity="0.86"
        fill-rule="evenodd"
        pointer-events="none"
      />
    {/if}
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
      {#each floorSupports(displayFloor) as spot (`${spot.x}:${spot.z}`)}
        {@const side = spot.support.type === 'pier' ? pierSide(defaultSystem) : supportSpec(spot.support.type).size}
        {@const angle = (Math.atan2(spot.dir.z, spot.dir.x) * 180) / Math.PI}
        <g transform="translate({spot.x} {spot.z}) rotate({angle})" pointer-events="none">
          {#if spot.support.type === 'column'}
            <rect x={-side / 2} y={-side / 2} width={side} height={side} fill="#f5f5f4" stroke="#44403c" stroke-width={s(0.015)} />
            <circle r={0.12} fill="#a8a29e" stroke="#44403c" stroke-width={s(0.012)} />
          {:else if spot.support.type === 'pole'}
            <circle r={side / 2} fill="#8b6b4a" stroke="#44403c" stroke-width={s(0.012)} />
          {:else}
            <rect
              x={-side / 2}
              y={-side / 2}
              width={side}
              height={side}
              fill={spot.support.type === 'steel' ? '#3a3f44' : '#a8927a'}
              stroke="#44403c"
              stroke-width={s(0.012)}
            />
          {/if}
        </g>
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
      <ContextPanel label="Stair" title="Stair" onclose={() => chooseSelection({})}>
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
      </ContextPanel>
    {/if}
    {#if selectedService && showServices && !roofFloor}
      <ContextPanel label={selectedService === 'sewer' ? 'Drain to the sewer' : 'Water main'} onclose={() => chooseSelection({})}>
        {#if selectedService === 'sewer'}
          <h2 class="font-semibold">{plumbing.septic ? 'Drain to the septic tank' : 'Drain to the sewer'}</h2>
          <div class="grid gap-1.5">
            <Label>Connects to</Label>
            <Select.Root
              type="single"
              value={document.services?.sewerType ?? 'municipal'}
              onValueChange={(next) => applyResult(documentStore.setSewerType(next as SewerType))}
            >
              <Select.Trigger class="w-full">{plumbing.septic ? 'Septic tank and soakaway' : 'Municipal sewer'}</Select.Trigger>
              <Select.Content>
                <Select.Item value="municipal" label="Municipal sewer" />
                <Select.Item value="septic" label="Septic tank and soakaway" />
              </Select.Content>
            </Select.Root>
          </div>
          {#if plumbing.septic}
            <p>
              A {plumbing.septic.litres.toLocaleString('en-ZA')} litre tank for {plumbing.septic.bedrooms}
              {plumbing.septic.bedrooms === 1 ? 'bedroom' : 'bedrooms'}, overflowing to a soakaway downhill. Drag either to move it.
            </p>
            <p class="text-xs text-muted-foreground">
              Rules of thumb: the tank {SEPTIC_CLEAR_BUILDING_M} m from buildings, the soakaway {SOAKAWAY_CLEAR_BUILDING_M} m from
              buildings and {SOAKAWAY_CLEAR_BOUNDARY_M} m from the boundary. Your municipality sets the real figures.
            </p>
          {/if}
          {#if sewerProfile}
            {@const last = sewerProfile.points.at(-1)!}
            <p>
              {checkFormat.format(sewerProfile.length)} m of 110 mm drain at 1 in {DRAIN_FALL[110]} or steeper, down to
              {checkFormat.format(sewerProfile.deepest)} m at its deepest.
            </p>
            {#if sewerProfile.shortBy > 0.005}
              <p class="text-amber-700">
                It reaches the connection {Math.round(sewerProfile.shortBy * 1000)} mm too low. Drag the connection to lower
                ground, bend the route over lower ground, or plan for a pump.
              </p>
            {:else}
              <p class="text-muted-foreground">
                It arrives {Math.round((last.ground - last.invert) * 1000)} mm below the ground, above the
                {plumbing.septic ? 'tank inlet' : 'sewer'} at
                {Math.round((plumbing.septic ? SEPTIC_INLET_DEPTH_M : (document.services?.sewerDepth ?? DEFAULT_SEWER_DEPTH_M)) * 1000)} mm.
              </p>
            {/if}
          {:else}
            <p class="text-muted-foreground">Place a toilet, basin, shower, bath or sink and the drain appears.</p>
          {/if}
          <div class="grid gap-1.5" hidden={plumbing.septic !== null}>
            <Label for="sewer-depth">Sewer depth at the connection (mm)</Label>
            <Input
              id="sewer-depth"
              type="number"
              min="300"
              step="50"
              value={Math.round((document.services?.sewerDepth ?? DEFAULT_SEWER_DEPTH_M) * 1000)}
              onchange={(event) => applyResult(documentStore.setSewerDepth(Number(event.currentTarget.value) / 1000))}
            />
          </div>
        {:else}
          <h2 class="font-semibold">Water main</h2>
          <p>{checkFormat.format(plumbing.waterMain)} m of 22 mm pipe from the meter to the house, in a 450 mm trench.</p>
        {/if}
        <p class="text-xs text-muted-foreground">
          Drag the {selectedService === 'sewer' ? 'connection' : 'meter'} along the boundary, drag a + to add a bend, and Delete removes a selected bend.
        </p>
        <Button variant="outline" onclick={straightenSelected}>Straighten the route</Button>
      </ContextPanel>
    {/if}
    {#if chosenFixture && !roofFloor}
      <ContextPanel label="Fitting" title={chosenFixture.spec.name} description={chosenFixture.spec.text} onclose={() => chooseSelection({})}>
        {#if chosenFixture.fixture.kind === 'db-board'}
          <p>
            Feeds {wiring.circuits.length} {wiring.circuits.length === 1 ? 'circuit' : 'circuits'}{wiring.boardSize
              ? `; a ${wiring.boardSize}-way board.`
              : '.'}
          </p>
        {:else if shownCircuits[0]}
          {@const circuit = shownCircuits[0]}
          <p>
            On <span class="font-medium">{circuit.id}</span>, {circuit.name.toLowerCase()}: {circuit.breaker} A breaker,
            {circuit.cable} mm² cable, {circuit.points.length}
            {circuit.points.length === 1 ? 'point' : 'points'}, about {checkFormat.format(circuit.length)} m of cable.
          </p>
        {:else if chosenFixture.spec.trade === 'electrical' && chosenFixture.fixture.kind !== 'stove'}
          <p class="text-amber-700">Not on a circuit yet: place a distribution board.</p>
        {/if}
        <FittingSetup floorId={chosenFixture.floorId} fixture={chosenFixture.fixture} onresult={applyResult} />
        <div class="grid gap-2">
          {#if chosenFixture.onWall}
            <Button data-look variant="outline" onclick={() => chosenFixture?.onWall && onFocus?.(chosenFixture.onWall.wall.id)}>Show the wall in Focus</Button>
          {/if}
          <Button variant="destructive" onclick={removeChosenFixture}>Remove</Button>
        </div>
      </ContextPanel>
    {/if}
    {#if selectedEdge !== null && !roofFloor}
      {@const side = plotSide(document.plot, selectedEdge)}
      {#if side}
        {@const onRoad = (document.plot.roads ?? []).includes(selectedEdge)}
        <ContextPanel
          label="Side of the plot"
          title="Side of the plot"
          description="{checkFormat.format(side.length)} m along the boundary, facing {side.facing}."
          onclose={() => chooseSelection({})}
        >
          <div class="grid gap-1.5">
            <Label for="plot-road">Road access</Label>
            <Select.Root
              type="single"
              value={onRoad ? 'road' : 'none'}
              onValueChange={(next) => next && selectedEdge !== null && applyResult(documentStore.setPlotRoad(selectedEdge, next === 'road'))}
            >
              <Select.Trigger id="plot-road" size="sm" class="w-full">{onRoad ? 'On a road' : 'No road'}</Select.Trigger>
              <Select.Content>
                <Select.Item value="road" label="On a road" />
                <Select.Item value="none" label="No road" />
              </Select.Content>
            </Select.Root>
          </div>
          <p class="text-muted-foreground">
            {onRoad
              ? 'A street runs along this side: a grass verge, then the road. It is drawn for context; it is not costed.'
              : 'Mark the sides of the plot that are on a street. A corner plot has two.'}
          </p>
        </ContextPanel>
      {/if}
    {/if}
    {#if chosenRetaining && !roofFloor}
      {@const measure = chosenRetaining.measure}
      <ContextPanel
        label="Retaining wall"
        title={retainingSpec(chosenRetaining.wall.type).name}
        description={retainingSpec(chosenRetaining.wall.type).text}
        onclose={() => chooseSelection({})}
      >
        <div class="grid gap-1.5">
          <Label for="retaining-type">Built of</Label>
          <Select.Root
            type="single"
            value={chosenRetaining.wall.type}
            onValueChange={(next) => next && chosenRetaining && applyResult(documentStore.updateRetainingWall(chosenRetaining.wall.id, { type: next as RetainingType }))}
          >
            <Select.Trigger id="retaining-type" size="sm" class="w-full">{retainingSpec(chosenRetaining.wall.type).name}</Select.Trigger>
            <Select.Content>
              {#each RETAINING_TYPES as spec (spec.id)}
                <Select.Item value={spec.id} label={spec.name} />
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <table class="sheet still rounded-md border">
          <tbody>
            <tr><td class="label">Length</td><td class="text-right font-medium tabular-nums">{checkFormat.format(measure.length)} m</td></tr>
            <tr>
              <td class="label">Holds back, at most</td>
              <td class="text-right font-medium tabular-nums" class:warn={measure.highest > RETAINING_ENGINEER_M}>{checkFormat.format(measure.highest)} m</td>
            </tr>
            <tr><td class="label">On average</td><td class="text-right font-medium tabular-nums">{checkFormat.format(measure.average)} m</td></tr>
          </tbody>
        </table>
        {#if measure.highest > RETAINING_ENGINEER_M}
          <p class="text-amber-700">Over {RETAINING_ENGINEER_M} m of retained ground needs an engineer's design.</p>
        {/if}
        <Button variant="destructive" onclick={removeChosenRetaining}>Remove</Button>
      </ContextPanel>
    {/if}
    {#if chosenCounter && !roofFloor}
      <ContextPanel
        label="Counter"
        title={counterKindSpec(chosenCounter.kind).name}
        description="{Math.round(chosenCounter.length * 1000)} × {Math.round(chosenCounter.depth * 1000)} mm, {counterKindSpec(chosenCounter.kind).height * 1000} mm high."
        onclose={() => chooseSelection({})}
      >
        <div class="grid gap-1.5">
          <Label>Worktop</Label>
          <SwatchPicker
            label="Worktop"
            options={COUNTER_TOPS.map((spec) => ({ id: spec.id, name: spec.name, swatch: spec.colour }))}
            value={chosenCounter.top}
            onchange={(next) => patchChosenCounter({ top: next })}
          />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div class="grid gap-1.5">
            <Label for="counter-length">Length (mm)</Label>
            <Input
              id="counter-length"
              type="number"
              min="300"
              step="50"
              value={Math.round(chosenCounter.length * 1000)}
              onchange={(event) => patchChosenCounter({ length: Number(event.currentTarget.value) / 1000 })}
            />
          </div>
          <div class="grid gap-1.5">
            <Label for="counter-depth">Depth (mm)</Label>
            <Input
              id="counter-depth"
              type="number"
              min="300"
              max="1500"
              step="50"
              value={Math.round(chosenCounter.depth * 1000)}
              onchange={(event) => patchChosenCounter({ depth: Number(event.currentTarget.value) / 1000 })}
            />
          </div>
        </div>
        {#if chosenCounter.kind === 'base'}
          <label class="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              class="size-4 accent-primary"
              checked={chosenCounter.wallUnits ?? false}
              onchange={(event) => patchChosenCounter({ wallUnits: event.currentTarget.checked })}
            />
            Cupboards on the wall above
          </label>
        {/if}
        {#each counterIssues(document).filter((issue) => issue.id.startsWith(`counter:${chosenCounter.id}:`)) as issue (issue.id)}
          <p class="text-amber-700">{issue.text}</p>
        {/each}
        <Button variant="destructive" onclick={removeChosenCounter}>Remove</Button>
      </ContextPanel>
    {/if}
    {#if chosenCarport && !roofFloor}
      {@const size = carportSize(chosenCarport)}
      <ContextPanel
        label="Carport"
        title={carportName(chosenCarport.bays)}
        description="{size.wide.toFixed(2)} × {size.deep.toFixed(1)} m. {carportRoofSpec(chosenCarport.roof).text}"
        onclose={() => chooseSelection({})}
      >
        <div class="grid gap-1.5">
          <Label>Cars</Label>
          <ToggleGroup.Root
            type="single"
            variant="outline"
            size="sm"
            value={String(chosenCarport.bays)}
            onValueChange={(next) => next && chosenCarport && applyResult(documentStore.updateCarport(chosenCarport.id, { bays: Number(next) as Carport['bays'] }))}
            aria-label="How many cars"
          >
            {#each CARPORT_BAYS as bays (bays)}
              <ToggleGroup.Item value={String(bays)} class="flex-1">{bays === 1 ? 'Single' : bays === 2 ? 'Double' : 'Triple'}</ToggleGroup.Item>
            {/each}
          </ToggleGroup.Root>
        </div>
        <div class="grid gap-1.5">
          <Label for="carport-roof">Roof</Label>
          <Select.Root
            type="single"
            value={chosenCarport.roof}
            onValueChange={(next) => next && chosenCarport && applyResult(documentStore.updateCarport(chosenCarport.id, { roof: next as CarportRoof }))}
          >
            <Select.Trigger id="carport-roof" size="sm" class="w-full">{carportRoofSpec(chosenCarport.roof).name}</Select.Trigger>
            <Select.Content>
              {#each CARPORT_ROOFS as spec (spec.id)}
                <Select.Item value={spec.id} label={spec.name} />
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <Button variant="outline" onclick={turnChosenCarport}><RotateCw />Turn a quarter turn</Button>
        {#each carportWarnings.filter((issue) => issue.carportId === chosenCarport?.id) as issue (issue.id)}
          <p class="text-amber-700">{issue.text}</p>
        {/each}
        <Button variant="destructive" onclick={removeChosenCarport}>Remove</Button>
      </ContextPanel>
    {/if}
    {#if chosenPaving && !roofFloor}
      {@const surface = chosenPaving.apron ? projectDefaults(document).apronSurface : chosenPaving.item.surface}
      <ContextPanel
        label="Paving"
        title={chosenPaving.apron ? 'Apron round the house' : `${PAVING[surface].name} paving`}
        description="{checkFormat.format(chosenPaving.area)} m². {PAVING[surface].text}"
        onclose={() => chooseSelection({})}
      >
        <div class="grid gap-1.5">
          <Label>Surface</Label>
          <SwatchPicker
            label="Paving surface"
            options={pavingOptions}
            value={surface}
            onchange={(next) =>
              chosenPaving &&
              applyResult(
                chosenPaving.apron
                  ? documentStore.setProjectDefaults({ apronSurface: next })
                  : documentStore.updatePaving(chosenPaving.item.id, { surface: next }),
              )}
          />
        </div>
        {#if chosenPaving.apron}
          <div class="grid gap-1.5">
            <Label for="apron-width">Width (mm)</Label>
            <Input
              id="apron-width"
              type="number"
              min="0"
              max="3000"
              step="100"
              value={Math.round(projectDefaults(document).apronWidth * 1000)}
              onchange={(event) => applyResult(documentStore.setProjectDefaults({ apronWidth: Number(event.currentTarget.value) / 1000 }))}
            />
          </div>
          <p class="text-muted-foreground">Laid along every outside wall to carry rain clear of the foundations. It is set for the whole project.</p>
        {/if}
        <Button variant="destructive" onclick={removeChosenPaving}>{chosenPaving.apron ? 'No apron' : 'Remove'}</Button>
      </ContextPanel>
    {/if}
    {#if selectedRoom && !roofFloor}
      <ContextPanel label="Room" onclose={() => chooseSelection({})}>
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
            <div class="flex items-baseline justify-between gap-2">
              <Label>Floor finish</Label>
              <span class="text-muted-foreground">{floorFinishSpec(resolved.space.finish).name}</span>
            </div>
            <SwatchPicker
              label="Floor finish"
              options={floorOptions}
              value={resolved.space.finish}
              onchange={(next) => patchSelectedSpace({ finish: next })}
              compact
            />
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
          <div class="grid gap-1.5 border-t pt-3">
            <Button
              variant="outline"
              onclick={() => {
                const kitchen = resolved.space.type === 'kitchen'
                focusRoom(resolved.space.id, resolved.cells.map((cell) => cell.ring))
                chooseSelection({})
                if (kitchen) setTool('draw-counter')
              }}
            >
              <Maximize2 />Lay out this room
            </Button>
            <Button variant="outline" onclick={suggestForSelectedRoom}><Plug />Suggest fittings</Button>
            <p class="text-xs text-muted-foreground">
              {selectedRoomFixtures > 0
                ? `${selectedRoomFixtures} fittings in this room. Suggesting adds a fresh set.`
                : `Lights, switches, sockets and plumbing for a ${roomTypeLabel(resolved.space.type).toLowerCase()}.`}
            </p>
          </div>
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
      </ContextPanel>
    {/if}
    {#if roofFloor}
      <ContextPanel label="Roof" title="Roof">
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
          <div class="grid gap-1.5">
            <Label>Gutters</Label>
            <Select.Root
              type="single"
              value={gutterOf(roof)}
              onValueChange={(next) => roofFloor && floorRoof(roofFloor.id, { ...roof, gutter: next as GutterType })}
            >
              <Select.Trigger class="w-full">{GUTTERS[gutterOf(roof)].name}</Select.Trigger>
              <Select.Content>
                {#each Object.entries(GUTTERS) as [id, spec] (id)}
                  <Select.Item value={id} label={spec.name} />
                {/each}
              </Select.Content>
            </Select.Root>
            <p class="text-xs text-muted-foreground">
              Every eave gets one{roof.noGutter?.length ? `, except above ${roof.noGutter.length} ${roof.noGutter.length === 1 ? 'wall' : 'walls'}` : ''}. Take it off a wall in Focus.
            </p>
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
      </ContextPanel>
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

  }

  .canvas {
    flex: 1;
    width: auto;
    min-width: 0;
    min-height: 0;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
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

  .service-line {
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .service-line.sewer {
    stroke: #7c4a1e;
  }
  .verge {
    fill: #d6e2c4;
  }
  .carriageway {
    fill: #6b6b70;
  }
  .centre-line {
    stroke: #f5f5f4;
  }
  .downpipe {
    fill: #ffffff;
    stroke: #57534e;
  }
  .downpipe.linked {
    fill: #0284c7;
    stroke: #0369a1;
  }
  .downpipe-lead {
    stroke: #0284c7;
    stroke-linecap: round;
  }
  .service-line.gas {
    stroke: #a21caf;
    stroke-dasharray: 0.12 0.08;
  }
  .service-line.gas.chosen {
    stroke-dasharray: none;
  }
  .service-line.water {
    stroke: #0284c7;
    stroke-dasharray: 0.3 0.15;
  }
  .service-mark.sewer {
    fill: #fef3c7;
    stroke: #7c4a1e;
  }
  .service-mark.water {
    fill: #e0f2fe;
    stroke: #0284c7;
  }
  .service-line.overflow {
    stroke-dasharray: 0.2 0.12;
  }
  .service-mark.septic {
    fill: #e7e5e4;
    stroke: #7c4a1e;
  }
  .service-mark.soakaway {
    fill: #f5f5f4;
    stroke: #7c4a1e;
    stroke-dasharray: 0.2 0.12;
  }
  .service-handle {
    fill: #ffffff;
    stroke: #2563eb;
  }
  .service-handle.active {
    fill: #2563eb;
  }
  .service-add {
    fill: #ffffff;
    stroke: #93c5fd;
  }
  .service-add-mark {
    stroke: #2563eb;
  }
  .service-exit {
    fill: #7c4a1e;
  }
  .service-depth {
    fill: #7c4a1e;
    font-family: system-ui, sans-serif;
  }
  .service-depth.short {
    fill: #b91c1c;
    font-weight: 600;
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

  .stair-flight.preview.invalid {
    fill: rgba(185, 28, 28, 0.08);
    stroke: #b91c1c;
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
