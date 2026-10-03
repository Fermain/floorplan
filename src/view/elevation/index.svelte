<script lang="ts">
  import type { OrthographicCamera } from 'three'
  import type { BufferGeometry } from 'three'
  import {
  buildOpeningFrameGeometry,
  buildOpeningGlassGeometry,
  buildOpeningPanelMeshes,
  type OpeningPanelMesh,
} from '../../lib/geometry/frames'
import { formatSchedule, scheduleWall } from '../../lib/geometry/schedule'
import { buildCourseFaceGeometries, buildFinishSkin, buildLintelGeometry, buildWallGeometries } from '../../lib/geometry/walls'
import { outsideFaces, resolveFinish } from '../../lib/geometry/finishes'
import { finishSpec, NO_PAINT, PAINTS, paintSpec, WALL_FINISHES } from '../../lib/model/finishes'
import {
  defaultOpeningDimensions,
  isFloorOpening,
  maxOpeningWidth,
  openingMinWidth,
  openingWidthLimits,
  placeOpeningU,
} from '../../lib/model/openings'
import { systemOf, WALL_SYSTEMS } from '../../lib/model/systems'
import type { Floor, Opening, OpeningKind, Wall, WallFinish, WallSystemId } from '../../lib/model/types'
  import { documentStore } from '../../lib/state/document.svelte'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import * as Select from '$lib/components/ui/select'
  import { Separator } from '$lib/components/ui/separator'
  import ElevationScene from './ElevationScene.svelte'
  import ElevationDimensions from './ElevationDimensions.svelte'
  import ContextPanel from '../shared/ContextPanel.svelte'
  import FittingSetup from '../shared/FittingSetup.svelte'
  import { Label } from '$lib/components/ui/label'
  import { SURFACE_BED_TOP_ABOVE_DATUM_M } from '../../lib/geometry/pad'
  import { WALL_HEAD } from '../../lib/plot/fixture'
  import { configureOrthoCamera, pointerToWallUv } from './elevation'
  import { placeSnappedOpeningU, snapLegalModuleU, snapOpeningVertical, snapOpeningWidth } from './moduleSnap'
  import { computeWallElevationFrame, flipFrame } from './wallFrame'
  import { defaultWallSide, wallFaces, type WallSide } from '../../lib/geometry/spaces'
  import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right'
  import ArrowLeft from '@lucide/svelte/icons/arrow-left'
  import MousePointer2 from '@lucide/svelte/icons/mouse-pointer-2'
  import Plus from '@lucide/svelte/icons/plus'
  import * as ToggleGroup from '$lib/components/ui/toggle-group'
  import { buildFenceParts, fenceFrame, type FencePart } from '../../lib/geometry/fence'
  import {
    DEFAULT_FENCE_HEIGHT_M,
    FENCE_MAX_HEIGHT_M,
    FENCE_MIN_HEIGHT_M,
    FENCES,
    fencePosts,
    fenceSpec,
  } from '../../lib/model/fences'
  import type { CorniceType, FaceTrim, FenceType, Fixture, FixtureKind, GutterType, SkirtingType, SupportType } from '../../lib/model/types'
  import { buildTrimParts, trimRuns } from '../../lib/geometry/trims'
  import { PORTS, type PortKind } from '../../lib/model/ports'
  import { GAS_RUN_Y, gasLayout, regulatorY } from '../../lib/geometry/gas'
  import { chaseRuns } from '../../lib/geometry/plumbing'
  import { cornerById } from '../../lib/model/geom'
  import { wallReach } from '../../lib/geometry/outline'
  import { CORNICES, corniceSpec, faceTrim, SKIRTINGS, skirtingSpec } from '../../lib/model/trims'
  import { buildGutterParts, GUTTERS, gutterLayout, gutterOf } from '../../lib/geometry/gutters'
  import { supportingFloor } from '../../lib/model/stories'
  import { bottleSetup, EITHER_SIDE, FIXTURES, tankLitres, fitFixtureY, fixtureSize, fixtureSpec, indoorBottles } from '../../lib/model/fixtures'
  import { buildFixtureParts, finishedFloor, fixtureOnFace, fixtureStandAboveDatum, fixturesOnWall, TANK_SNAP_M, type FixturePart } from '../../lib/geometry/fixtures'
  import {
    defaultSupport,
    evenPositions,
    SUPPORT_HEIGHT_M,
    SUPPORT_MAX_SPACING_M,
    SUPPORT_MIN_SPACING_M,
    SUPPORTS,
    supportSpec,
  } from '../../lib/model/supports'
  import { buildPillarParts, type PillarPart } from '../../lib/geometry/pillars'
  import { wallSystem } from '../../lib/model/systems'

  interface Props {
    wallId?: string
    selectedOpeningId?: string | null
    onSelectOpening?: (id: string | null) => void
    onStatus?: (status: { text: string; error: boolean }) => void
    onExit?: () => void
  }

  let { wallId, selectedOpeningId = null, onSelectOpening, onStatus, onExit }: Props = $props()

  let locked = $state(true)
  let insertTool = $state<OpeningKind>('window')
  let preferredWidth = $state<Partial<Record<OpeningKind, number>>>({})
  let widthDraft = $state<number | null>(null)
  let orthoCamera = $state<OrthographicCamera | undefined>(undefined)
  let readout = $state<{ u: number; v: number } | null>(null)

  type Drag = {
    id: string
    originU: number
    originV: number
    u: number
    v: number
    grabU: number
    grabV: number
    aligned: boolean
  }

  let drag = $state<Drag | null>(null)

  // Like the plan: clicks select by default; a click places something only in Place mode.
  let mode = $state<'select' | 'place'>('select')
  let insertFixture = $state<FixtureKind | null>(null)
  let selectedFixtureId = $state<string | null>(null)
  type FixtureDrag = { id: string; grabU: number; grabV: number; u: number; y: number; moved: boolean }
  let fixtureDrag = $state<FixtureDrag | null>(null)

  const doc = $derived(documentStore.document)

  const located = $derived.by((): { floor: Floor; wall: Wall } | undefined => {
    const floors = doc.building.floors
    if (wallId) {
      for (const floor of floors) {
        const wall = floor.walls.find((w) => w.id === wallId)
        if (wall) return { floor, wall }
      }
      return undefined
    }
    const floor = floors[0]
    const wall = floor?.walls[0]
    if (!floor || !wall) return undefined
    return { floor, wall }
  })

  const floor = $derived(located?.floor)
  const wall = $derived(located?.wall)
  const system = $derived(systemOf(wall ?? { skin: 'double' }))
  const gap = $derived(system.moduleLength)

  const editingOpening = $derived.by(() => {
    if (!wall || !selectedOpeningId) return undefined
    return wall.openings.find((item) => item.id === selectedOpeningId)
  })

  function mm(m: number): number {
    return Math.round(m * 1000)
  }

  const logical = $derived(wall?.skin === 'logical')
  const fence = $derived(logical ? wall?.fence : undefined)
  const support = $derived(logical ? wall?.support : undefined)

  const frame = $derived.by(() => {
    if (!floor || !wall) {
      return undefined
    }
    if (logical) {
      const tallest = Math.max(fence?.height ?? 0, support ? SUPPORT_HEIGHT_M : 0)
      return computeWallElevationFrame(floor, wall, Math.max(1.2, tallest + 0.4))
    }
    return computeWallElevationFrame(floor, wall)
  })

  const faces = $derived(floor && wall ? wallFaces(floor, wall.id) : null)
  let sideChoice = $state<{ wallId: string; side: WallSide } | null>(null)
  const side = $derived<WallSide>(
    sideChoice && sideChoice.wallId === wall?.id ? sideChoice.side : defaultWallSide(faces),
  )
  const viewFrame = $derived(frame && side === -1 ? flipFrame(frame) : frame)
  const viewFace = $derived(faces?.find((face) => face.side === side) ?? null)
  const farFace = $derived(faces?.find((face) => face.side !== side) ?? null)

  function flipSide() {
    if (!wall) return
    sideChoice = { wallId: wall.id, side: side === 1 ? -1 : 1 }
  }

  $effect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'f' && event.key !== 'F') return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      event.preventDefault()
      flipSide()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Openings as seen from the current face: measured from the left of the view.
  function shownOpenings(openings: Opening[]): Opening[] {
    if (side === 1 || !frame) return openings
    const length = frame.length
    return openings.map((opening) => ({ ...opening, u: length - opening.u - opening.width }))
  }

  const ffl = $derived(floor ? finishedFloor(floor) : 0)
  const wallFittings = $derived(floor && wall && !logical ? fixturesOnWall(floor, wall.id) : [])
  const faceFittings = $derived(wallFittings.filter((item) => item.side === side))
  const selectedFitting = $derived(faceFittings.find((item) => item.fixture.id === selectedFixtureId) ?? null)
  const fittingChoices = $derived(
    FIXTURES.filter((spec) => spec.mount !== 'ceiling' && (spec.outside === (viewFace?.outside ?? false) || EITHER_SIDE.includes(spec.id))),
  )

  // Where each fitting on this wall is drawn, with a fitting being dragged shown where it is going.
  const shownFittings = $derived.by(() => {
    const moving = fixtureDrag
    if (!floor || !wall) return wallFittings.map((item) => item.fixture)
    return wallFittings.map((item) => {
      if (!moving || moving.id !== item.fixture.id) return item.fixture
      const moved = fixtureOnFace(floor, wall, item.side, item.fixture.kind, moving.u, moving.y, setupOf(item.fixture))
      return moved ? { ...item.fixture, ...moved } : item.fixture
    })
  })

  const fittingParts = $derived.by((): FixturePart[] =>
    floor ? buildFixtureParts(shownFittings, (fixture) => floor.datumHeight + fixtureStandAboveDatum(doc, floor, fixture)) : [],
  )

  $effect(() => {
    const parts = fittingParts
    return () => {
      for (const part of parts) part.geometry.dispose()
    }
  })

  // Gas bottles and tanks keep their size as they move.
  function setupOf(fixture: Fixture) {
    if (fixture.kind === 'water-tank') return { litres: tankLitres(fixture) }
    if (fixture.kind !== 'gas-cylinder') return {}
    const { count, kg, cage } = bottleSetup(fixture)
    return { bottles: count, bottleKg: kg, cage }
  }

  function viewU(u: number): number {
    return side === -1 && frame ? frame.length - u : u
  }

  const fittingMarks = $derived(
    faceFittings.map((item) => {
      const spec = fixtureSpec(item.fixture.kind)
      const moving = fixtureDrag?.id === item.fixture.id ? fixtureDrag : null
      const u = moving ? moving.u : item.u
      const y = moving ? moving.y : item.fixture.y
      const stand = floor ? fixtureStandAboveDatum(doc, floor, item.fixture) : ffl
      return {
        id: item.fixture.id,
        u: viewU(u),
        width: fixtureSize(item.fixture).width,
        bottom: stand + y,
        top: stand + y + fixtureSize(item.fixture).height,
        selected: item.fixture.id === selectedFixtureId,
        label: spec.name,
      }
    }),
  )

  function fittingAt(u: number, v: number) {
    for (const item of faceFittings) {
      const size = fixtureSize(item.fixture)
      const pad = 0.04
      const bottom = (floor ? fixtureStandAboveDatum(doc, floor, item.fixture) : ffl) + item.fixture.y
      if (Math.abs(u - item.u) <= size.width / 2 + pad && v >= bottom - pad && v <= bottom + size.height + pad) return item
    }
    return null
  }

  // Electrical points on a wall share a conduit when one sits straight above another: snap to that line.
  const CONDUIT_SNAP_M = 0.12
  const conduitKinds = (kind: FixtureKind) => {
    const spec = fixtureSpec(kind)
    return spec.trade === 'electrical' && spec.mount === 'wall'
  }

  // Downpipes standing in front of this face, by how far along the wall they are.
  const faceDownpipes = $derived.by(() => {
    if (!floor || !wall || logical || !viewFace?.outside) return []
    const p = cornerById(floor.corners, wall.startCornerId)
    const q = cornerById(floor.corners, wall.endCornerId)
    if (!p || !q) return []
    const length = Math.hypot(q.x - p.x, q.z - p.z)
    if (length < 1e-6) return []
    const t = { x: (q.x - p.x) / length, z: (q.z - p.z) / length }
    const n = { x: -t.z * side, z: t.x * side }
    return gutterLayout(doc)
      .downpipes.map((pipe) => ({ u: (pipe.x - p.x) * t.x + (pipe.z - p.z) * t.z, out: (pipe.x - p.x) * n.x + (pipe.z - p.z) * n.z }))
      .filter((pipe) => pipe.out > 0 && pipe.out < 2 && pipe.u > -1 && pipe.u < length + 1)
      .map((pipe) => pipe.u)
  })

  function snapFittingU(kind: FixtureKind, u: number, except: string | null): number {
    // A rainwater tank slides under a downpipe on this face.
    if (kind === 'water-tank') {
      const pipe = faceDownpipes.filter((at) => Math.abs(at - u) < TANK_SNAP_M).sort((a, b) => Math.abs(a - u) - Math.abs(b - u))[0]
      return pipe ?? u
    }
    if (!conduitKinds(kind)) return u
    let best: number | null = null
    for (const item of faceFittings) {
      if (item.fixture.id === except || !conduitKinds(item.fixture.kind)) continue
      if (Math.abs(item.u - u) < CONDUIT_SNAP_M && (best === null || Math.abs(item.u - u) < Math.abs(best - u))) best = item.u
    }
    return best ?? u
  }

  // A conduit from each electrical point on the face up to the ceiling; points in one column share one.
  // A conduit that would have to pass through a window or door is a clash: move the point or the opening.
  const conduits = $derived.by(() => {
    const columns: { u: number; bottom: number; names: string[] }[] = []
    for (const mark of fittingMarks) {
      const item = faceFittings.find((entry) => entry.fixture.id === mark.id)
      if (!item || !conduitKinds(item.fixture.kind)) continue
      const column = columns.find((entry) => Math.abs(entry.u - mark.u) < 0.005)
      if (column) {
        column.bottom = Math.min(column.bottom, mark.top)
        column.names.push(mark.label)
      } else columns.push({ u: mark.u, bottom: mark.top, names: [mark.label] })
    }
    const openings = displayWall && !logical ? shownOpenings(displayWall.openings) : []
    return columns.map((column) => {
      const through = openings.find(
        (opening) =>
          column.u > opening.u - 0.02 &&
          column.u < opening.u + opening.width + 0.02 &&
          opening.v < WALL_HEAD &&
          opening.v + opening.height > column.bottom,
      )
      return { u: column.u, bottom: column.bottom, top: WALL_HEAD, clash: Boolean(through), names: column.names, through: through?.kind }
    })
  })
  // Where the plumbing fittings on this face come through the wall, seen from the room.
  const ports = $derived.by(() => {
    const out: { u: number; v: number; r: number; kind: PortKind; dia: number }[] = []
    for (const mark of fittingMarks) {
      const item = faceFittings.find((entry) => entry.fixture.id === mark.id)
      if (!item) continue
      for (const port of PORTS[item.fixture.kind] ?? []) {
        out.push({ u: mark.u + port.along, v: mark.bottom - item.fixture.y + port.y, r: Math.max(port.dia / 2, 0.012), kind: port.kind, dia: port.dia })
      }
    }
    return out
  })

  // The water and waste pipes chased into this face, laid out the same way Quantities counts them.
  const pipeRuns = $derived.by((): { kind: PortKind; points: [number, number][] }[] => {
    // Outside, a gas geyser's water goes straight through the wall behind it.
    if (viewFace?.outside) return gasRuns
    return [...chaseRuns(ports.filter((port) => port.kind !== 'gas'), ffl, WALL_HEAD), ...gasRuns]
  })

  // Gas: copper pipe clipped along the outside wall from the bottles, rising to a gas geyser or through the wall
  // to a stove. Inside, a stove fed from further off has its pipe come along the floor.
  const gas = $derived(gasLayout(doc))
  const gasRuns = $derived.by(() => {
    const runs: { kind: PortKind; points: [number, number][] }[] = []
    if (!floor || !wall || logical || !frame) return runs
    const p = cornerById(floor.corners, wall.startCornerId)
    const q = cornerById(floor.corners, wall.endCornerId)
    if (!p || !q) return runs
    const length = Math.hypot(q.x - p.x, q.z - p.z)
    if (length < 1e-6) return runs
    const t = { x: (q.x - p.x) / length, z: (q.z - p.z) / length }
    const n = { x: -t.z * side, z: t.x * side }
    const reach = wallReach(wall)
    const across = (at: { x: number; z: number }) => (at.x - p.x) * n.x + (at.z - p.z) * n.z
    const along = (at: { x: number; z: number }) => (at.x - p.x) * t.x + (at.z - p.z) * t.z
    const onFace = (at: { x: number; z: number }) => Math.abs(across(at) - reach) < 0.12 && along(at) > -0.2 && along(at) < length + 0.2
    const level = (viewFace?.outside ? 0 : ffl) + GAS_RUN_Y
    const here = (fixtureId: string) => faceFittings.find((item) => item.fixture.id === fixtureId)
    for (const run of gas.runs) {
      if (viewFace?.outside) {
        for (let i = 1; i < run.path.length; i++) {
          const a = run.path[i - 1]
          const b = run.path[i]
          if (!onFace(a) || !onFace(b)) continue
          const ua = viewU(Math.min(length, Math.max(0, along(a))))
          const ub = viewU(Math.min(length, Math.max(0, along(b))))
          if (Math.abs(ua - ub) > 1e-3) runs.push({ kind: 'gas', points: [[ua, level], [ub, level]] })
        }
        const bottles = here(run.cylinder.fixture.id)
        if (bottles) {
          const stand = fixtureStandAboveDatum(doc, floor, bottles.fixture)
          runs.push({ kind: 'gas', points: [[viewU(bottles.u), stand + regulatorY(bottles.fixture)], [viewU(Math.min(length, Math.max(0, along(run.path[0])))), level]] })
        }
        const end = run.path[run.path.length - 1]
        const heater = here(run.item.fixture.id)
        const port = (PORTS[run.item.fixture.kind] ?? []).find((item) => item.kind === 'gas')
        if (heater && port) runs.push({ kind: 'gas', points: [[viewU(Math.min(length, Math.max(0, along(end)))), level], [viewU(heater.u) + port.along, ffl + port.y]] })
      } else {
        const stove = here(run.item.fixture.id)
        const port = (PORTS[run.item.fixture.kind] ?? []).find((item) => item.kind === 'gas')
        if (stove && port && !run.direct) {
          const u = viewU(stove.u) + port.along
          runs.push({ kind: 'gas', points: [[u, ffl + port.y], [u, ffl]] })
        }
      }
    }
    return runs
  })

  // A pipe chased into the wall cannot run through a window or door either. The runs are square to the wall,
  // so each straight stretch is checked against each opening's rectangle.
  const shownPipes = $derived.by(() => {
    const openings = displayWall && !logical ? shownOpenings(displayWall.openings) : []
    return pipeRuns.map((run) => {
      const through = openings.find((opening) =>
        run.points.slice(1).some(([u1, v1], i) => {
          const [u0, v0] = run.points[i]
          const lo = { u: Math.min(u0, u1), v: Math.min(v0, v1) }
          const hi = { u: Math.max(u0, u1), v: Math.max(v0, v1) }
          return (
            hi.u > opening.u + 0.01 && lo.u < opening.u + opening.width - 0.01 && hi.v > opening.v + 0.01 && lo.v < opening.v + opening.height - 0.01
          )
        }),
      )
      return { ...run, clash: Boolean(through), through: through?.kind }
    })
  })
  const pipeClash = $derived(shownPipes.find((run) => run.clash) ?? null)

  const clash = $derived(conduits.find((conduit) => conduit.clash) ?? null)

  function snapFittingY(y: number): number {
    const step = system.courseHeight / 2
    return Math.max(0, Math.round(y / step) * step)
  }

  function chooseFitting(id: string | null) {
    selectedFixtureId = id
    if (id) onSelectOpening?.(null)
  }

  function removeSelectedFitting() {
    if (!floor || !selectedFixtureId) return
    documentStore.removeFixture(floor.id, selectedFixtureId)
    selectedFixtureId = null
  }


  $effect(() => {
    if (!selectedFixtureId) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      const target = event.target
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      event.preventDefault()
      removeSelectedFitting()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  $effect(() => {
    if (selectedOpeningId) selectedFixtureId = null
  })

  // Esc steps back: out of placing, then out of a selection, and only then out of Focus (handled by the page).
  $effect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'v' || event.key === 'V') mode = 'select'
      else if (event.key === 'p' || event.key === 'P') mode = 'place'
      else if (event.key === 'Escape') {
        if (mode === 'place') mode = 'select'
        else if (selectedOpeningId || selectedFixtureId) {
          onSelectOpening?.(null)
          selectedFixtureId = null
        } else return
        event.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  // The roof whose eave runs above this wall, and the gutter along it.
  const roofAbove = $derived(
    floor && wall
      ? (doc.building.floors.find((item) => item.roof && supportingFloor(doc, item)?.walls.some((w) => w.id === wall.id)) ?? null)
      : null,
  )
  const eaveLayout = $derived(roofAbove ? gutterLayout(doc) : null)
  const wallGutter = $derived(
    roofAbove && eaveLayout && wall ? eaveLayout.pieces.filter((piece) => piece.roofFloorId === roofAbove.id && piece.wallId === wall.id) : [],
  )
  const gutterValue = $derived(
    wallGutter.length === 0 || !roofAbove?.roof ? null : wallGutter.some((piece) => piece.on) ? gutterOf(roofAbove.roof) : 'none',
  )

  function chooseGutter(next: string) {
    if (!roofAbove?.roof || !wall) return
    const others = (roofAbove.roof.noGutter ?? []).filter((id) => id !== wall.id)
    const without = next === 'none' ? [...others, wall.id].sort() : others
    const { noGutter: _old, ...rest } = roofAbove.roof
    documentStore.setRoof(roofAbove.id, {
      ...rest,
      ...(next === 'none' ? {} : { gutter: next as GutterType }),
      ...(without.length > 0 ? { noGutter: without } : {}),
    })
  }

  // Only this wall's gutter and the downpipes at its ends: the camera stands out in front of the wall, so gutters
  // on other walls of the roof can come between it and the wall.
  const gutterParts = $derived.by((): FencePart[] => {
    if (!floor || !roofAbove?.roof || !eaveLayout || wallGutter.length === 0) return []
    const ends = wallGutter.flatMap((piece) => [piece.a, piece.b])
    const own = {
      pieces: wallGutter,
      downpipes: eaveLayout.downpipes.filter(
        (pipe) => pipe.roofFloorId === roofAbove.id && ends.some((end) => Math.hypot(end.x - pipe.x, end.z - pipe.z) < 0.7),
      ),
    }
    const offset = floor.datumHeight + WALL_HEAD
    const ground = doc.building.floors.find((item) => item.index === 0)
    const groundDatum = ground ? ground.datumHeight - offset : undefined
    return buildGutterParts(own, roofAbove.id, gutterOf(roofAbove.roof), () => -offset, groundDatum).map((part) => ({
      geometry: part.geometry.translate(0, offset, 0),
      colour: part.colour,
      opacity: 1,
    }))
  })

  $effect(() => {
    const parts = gutterParts
    return () => {
      for (const part of parts) part.geometry.dispose()
    }
  })

  // Skirting and cornice on the face in view; only that face, as other rooms' walls can stand in front of the camera.
  const faceRuns = $derived(floor && wall && !logical ? trimRuns(doc, floor).filter((run) => run.wall.id === wall.id && run.side === side) : [])
  const faceTrimNow = $derived(wall && !logical && faceRuns.length > 0 ? faceTrim(doc, wall, side) : null)

  const trimParts = $derived.by((): FencePart[] =>
    floor && faceRuns.length > 0
      ? buildTrimParts(faceRuns, floor, floor.datumHeight).map((part) => ({ ...part, opacity: 1 }))
      : [],
  )

  $effect(() => {
    const parts = trimParts
    return () => {
      for (const part of parts) part.geometry.dispose()
    }
  })

  // How the face in view is finished and painted, and whether that is its own choice or the project's.
  const faceFinishNow = $derived(floor && wall && !logical ? resolveFinish(doc, wall, side, viewFace?.outside ?? false) : null)

  function chooseFinish(patch: { finish?: WallFinish | null; paint?: string | null }) {
    if (!floor || !wall) return
    documentStore.setFaceFinish(floor.id, wall.id, side, patch)
  }

  // Plaster or bagging over each face of the wall, in its paint colour.
  const finishParts = $derived.by((): FencePart[] => {
    const shown = displayWall
    if (!floor || !wall || !shown || logical) return []
    const outside = outsideFaces(floor)
    const parts: FencePart[] = []
    for (const face of [1, -1] as const) {
      const finish = resolveFinish(doc, wall, face, outside(wall, face))
      if (finish.finish === 'exposed' || !finish.colour) continue
      const geometry = buildFinishSkin(floor, shown, face)
      if (geometry) parts.push({ geometry, colour: finish.colour, opacity: finish.finish === 'bagged' ? 0.82 : 1, roughness: 0.95 })
    }
    return parts
  })

  $effect(() => {
    const parts = finishParts
    return () => {
      for (const part of parts) part.geometry.dispose()
    }
  })

  function chooseTrim(patch: FaceTrim) {
    if (!floor || !wall) return
    documentStore.setFaceTrim(floor.id, wall.id, side, patch)
  }

  const fenceParts = $derived.by((): FencePart[] => {
    if (!floor || !wall || !fence) return []
    const line = fenceFrame(floor, wall)
    const base = floor.datumHeight
    return line ? buildFenceParts(line, fence, () => base) : []
  })

  $effect(() => {
    const parts = fenceParts
    return () => {
      for (const part of parts) part.geometry.dispose()
    }
  })

  const supportSpots = $derived.by(() => {
    if (!floor || !wall || !support) return []
    const line = fenceFrame(floor, wall)
    if (!line) return []
    return evenPositions(line.length, support.spacing).map((u) => ({
      x: line.start.x + line.dir.x * u,
      z: line.start.z + line.dir.z * u,
      dir: line.dir,
    }))
  })

  const pillarParts = $derived.by((): PillarPart[] => {
    if (!support || supportSpots.length === 0) return []
    return buildPillarParts(support.type, supportSpots, wallSystem(doc.building.wallSystemId), floor?.datumHeight ?? 0)
  })

  $effect(() => {
    const parts = pillarParts
    return () => {
      for (const part of parts) part.geometry.dispose()
    }
  })

  function chooseSupport(next: string) {
    if (!floor || !wall) return
    if (next === 'none') {
      documentStore.setSupport(floor.id, wall.id, null)
      return
    }
    const type = next as SupportType
    documentStore.setSupport(floor.id, wall.id, support ? { ...support, type } : defaultSupport(type))
  }

  function setSupportSpacingMm(value: number) {
    if (!floor || !wall || !support || !Number.isFinite(value)) return
    const spacing = Math.min(SUPPORT_MAX_SPACING_M, Math.max(SUPPORT_MIN_SPACING_M, value / 1000))
    documentStore.setSupport(floor.id, wall.id, { ...support, spacing })
  }

  function chooseFence(next: string) {
    if (!floor || !wall) return
    if (next === 'none') {
      documentStore.setFence(floor.id, wall.id, null)
      return
    }
    documentStore.setFence(floor.id, wall.id, {
      type: next as FenceType,
      height: fence?.height ?? DEFAULT_FENCE_HEIGHT_M,
    })
  }

  function setFenceHeightMm(value: number) {
    if (!floor || !wall || !fence || !Number.isFinite(value)) return
    const height = Math.min(FENCE_MAX_HEIGHT_M, Math.max(FENCE_MIN_HEIGHT_M, value / 1000))
    documentStore.setFence(floor.id, wall.id, { ...fence, height })
  }

  const widthKind = $derived(editingOpening?.kind ?? insertTool)

  const widthLimits = $derived.by(() => {
    if (!frame) return null
    const base = openingWidthLimits(widthKind, frame.length)
    if (!editingOpening || !wall) return base
    const others = wall.openings.filter((opening) => opening.id !== editingOpening.id)
    const centre = editingOpening.u + editingOpening.width / 2
    const room = maxOpeningWidth(centre, frame.length, others, undefined, gap)
    return { min: base.min, max: Math.min(base.max, room) }
  })
  const widthAllowed = $derived(widthLimits !== null && widthLimits.max >= widthLimits.min - 1e-9)

  const shownWidth = $derived.by(() => {
    const fallback =
      preferredWidth[widthKind] ?? defaultOpeningDimensions(widthKind, system, doc.building.defaults).width
    const raw = widthDraft ?? editingOpening?.width ?? fallback
    if (!widthLimits || !widthAllowed) return raw
    return Math.min(widthLimits.max, Math.max(widthLimits.min, raw))
  })

  const displayWall = $derived.by((): Wall | undefined => {
    if (!wall) return wall
    let openings = wall.openings
    const current = drag
    if (current) {
      openings = openings.map((opening) =>
        opening.id === current.id
          ? { ...opening, u: current.u, v: current.aligned ? opening.v : current.v }
          : opening,
      )
    } else if (widthDraft !== null && editingOpening && frame) {
      const centre = editingOpening.u + editingOpening.width / 2
      const others = wall.openings.filter((opening) => opening.id !== editingOpening.id)
      const u = placeOpeningU(centre - shownWidth / 2, shownWidth, frame.length, others, undefined, gap)
      if (u !== null) {
        openings = openings.map((opening) =>
          opening.id === editingOpening.id ? { ...opening, u, width: shownWidth } : opening,
        )
      }
    }
    if (openings === wall.openings) return wall
    return { ...wall, openings }
  })

  const selectedOpening = $derived.by(() => {
    if (!selectedOpeningId) return undefined
    const shown = displayWall ?? wall
    return shown?.openings.find((item) => item.id === selectedOpeningId)
  })

  const wallModel = $derived.by((): {
    blocks: BufferGeometry[]
    courses: BufferGeometry[]
    lintel: BufferGeometry | null
    frame: BufferGeometry | null
    glass: BufferGeometry | null
    panels: OpeningPanelMesh[]
  } => {
    const shown = displayWall
    if (!floor || !shown) {
      return { blocks: [], courses: [], lintel: null, frame: null, glass: null, panels: [] }
    }
    return {
      blocks: buildWallGeometries(floor, shown),
      courses: buildCourseFaceGeometries(floor, shown),
      lintel: buildLintelGeometry(floor, shown),
      frame: buildOpeningFrameGeometry(floor, shown),
      glass: buildOpeningGlassGeometry(floor, shown),
      panels: buildOpeningPanelMeshes(floor, shown),
    }
  })

  const scheduleLine = $derived.by(() => {
    const shown = displayWall
    if (!floor || !shown) return ''
    return formatSchedule(scheduleWall(floor, shown))
  })

  $effect(() => {
    const _opening = selectedOpeningId
    widthDraft = null
  })

  $effect(() => {
    const geoms = wallModel.blocks
    const courses = wallModel.courses
    const lintel = wallModel.lintel
    const frameGeom = wallModel.frame
    const glass = wallModel.glass
    const panels = wallModel.panels
    return () => {
      for (const g of geoms) g.dispose()
      for (const g of courses) g.dispose()
      lintel?.dispose()
      frameGeom?.dispose()
      glass?.dispose()
      for (const panel of panels) panel.geometry.dispose()
    }
  })

  function onOrthoCamera(camera: OrthographicCamera) {
    orthoCamera = camera
  }

  function openingAt(w: Wall, u: number, v: number): Opening | undefined {
    for (const o of w.openings) {
      if (u >= o.u && u <= o.u + o.width && v >= o.v && v <= o.v + o.height) {
        return o
      }
    }
    return undefined
  }

  function canvasFromTarget(target: EventTarget | null): {
    canvas: HTMLCanvasElement
    rect: DOMRect
  } | null {
    if (!(target instanceof HTMLElement)) return null
    const canvas = target.querySelector('canvas')
    if (!canvas) return null
    return { canvas, rect: canvas.getBoundingClientRect() }
  }

  function uvFromEvent(event: PointerEvent): { u: number; v: number } | null {
    if (!locked || !orthoCamera || !frame || !viewFrame) return null
    const picked = canvasFromTarget(event.currentTarget)
    if (!picked) return null
    const offsetX = event.clientX - picked.rect.left
    const offsetY = event.clientY - picked.rect.top
    if (picked.rect.width <= 0 || picked.rect.height <= 0) return null
    configureOrthoCamera(orthoCamera, picked.rect.width / picked.rect.height, viewFrame)
    const uv = pointerToWallUv(
      orthoCamera,
      offsetX,
      offsetY,
      picked.rect.width,
      picked.rect.height,
      viewFrame,
    )
    if (!uv || side === 1) return uv
    return { u: frame.length - uv.u, v: uv.v }
  }

  function onViewportPointerDown(event: PointerEvent) {
    if (!locked || !floor || !wall || !frame || logical) return
    const uv = uvFromEvent(event)
    if (!uv) return
    readout = uv

    const fitting = fittingAt(uv.u, uv.v)
    if (fitting) {
      chooseFitting(fitting.fixture.id)
      fixtureDrag = {
        id: fitting.fixture.id,
        grabU: uv.u - fitting.u,
        grabV: uv.v - (fixtureStandAboveDatum(doc, floor, fitting.fixture) + fitting.fixture.y),
        u: fitting.u,
        y: fitting.fixture.y,
        moved: false,
      }
      ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
      return
    }

    const hit = openingAt(displayWall ?? wall, uv.u, uv.v)
    if (hit) {
      selectedFixtureId = null
      onSelectOpening?.(hit.id)
      drag = {
        id: hit.id,
        originU: hit.u,
        originV: hit.v,
        u: hit.u,
        v: hit.v,
        grabU: uv.u - hit.u,
        grabV: uv.v - hit.v,
        aligned: hit.aligned,
      }
      ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
      return
    }

    if (mode === 'select') {
      onSelectOpening?.(null)
      selectedFixtureId = null
      return
    }

    if (insertFixture) {
      const spec = fixtureSpec(insertFixture)
      const y = spec.mount === 'wall' ? fitFixtureY(insertFixture, snapFittingY(uv.v - ffl - spec.height / 2)) : spec.y
      const placed = fixtureOnFace(floor, wall, side, insertFixture, snapFittingU(insertFixture, uv.u, null), y)
      if (!placed) return
      const draft = insertFixture === 'gas-cylinder' && !viewFace?.outside ? indoorBottles(placed) : placed
      const result = documentStore.addFixture(floor.id, draft)
      const added = result.ok ? result.document.building.floors.find((item) => item.id === floor.id)?.fixtures?.at(-1) : undefined
      if (added) chooseFitting(added.id)
      if (!event.shiftKey) mode = 'select'
      return
    }

    selectedFixtureId = null
    const min = openingMinWidth(insertTool)
    const placed = placeSnappedOpeningU(uv.u - shownWidth / 2, shownWidth, frame.length, wall.openings, min, system)
    if (placed === null) return
    selectAdded(documentStore.addOpening(floor.id, wall.id, insertTool, placed.u, placed.width))
    // One placement, then back to selecting; hold Shift to keep placing.
    if (!event.shiftKey) mode = 'select'
  }

  function onWidthInput(value: number) {
    if (editingOpening) widthDraft = value
    else preferredWidth[insertTool] = value
  }

  function commitWidth(value: number) {
    widthDraft = null
    const snapped = snapOpeningWidth(value, openingMinWidth(widthKind), system)
    if (!editingOpening || !floor || !wall) {
      preferredWidth[insertTool] = snapped
      return
    }
    const others = wall.openings.filter((opening) => opening.id !== editingOpening.id)
    const centre = editingOpening.u + editingOpening.width / 2
    const u = frame
      ? snapLegalModuleU(centre - snapped / 2, snapped, frame.length, others, system)
      : null
    documentStore.updateOpening(floor.id, wall.id, editingOpening.id, {
      width: snapped,
      ...(u === null ? {} : { u }),
    })
  }

  function chooseSystem(id: WallSystemId) {
    if (!floor || !wall || id === system.id) return
    preferredWidth = {}
    documentStore.setWallSystem(floor.id, wall.id, id)
  }

  function removeSelected() {
    if (!floor || !wall || !selectedOpeningId) return
    documentStore.removeOpening(floor.id, wall.id, selectedOpeningId)
    onSelectOpening?.(null)
  }

  function chooseInsert(value: string) {
    if (value.startsWith('fitting:')) {
      insertFixture = value.slice('fitting:'.length) as FixtureKind
      return
    }
    insertFixture = null
    insertTool = value as OpeningKind
  }

  const insertChoices: { kind: OpeningKind; label: string }[] = [
    { kind: 'window', label: 'Window' },
    { kind: 'door', label: 'Sliding door' },
    { kind: 'external-door', label: 'External door' },
    { kind: 'internal-door', label: 'Internal door' },
    { kind: 'garage', label: 'Garage door' },
    { kind: 'portal', label: 'Portal' },
  ]
  const insertValue = $derived(insertFixture ? `fitting:${insertFixture}` : insertTool)
  const insertLabel = $derived(
    insertFixture ? fixtureSpec(insertFixture).name : (insertChoices.find((choice) => choice.kind === insertTool)?.label ?? ''),
  )

  $effect(() => {
    onStatus?.(focusStatus())
    return () => onStatus?.({ text: '', error: false })
  })

  function focusStatus(): { text: string; error: boolean } {
    if (!wall || !frame) return { text: '', error: false }
    if (logical) {
      if (!fence && !support) {
        return {
          text: 'A logical wall marks a line without building it. Choose a fence or supports to build along it.',
          error: false,
        }
      }
      const parts: string[] = []
      if (support) {
        const count = supportSpots.length
        parts.push(`${supportSpec(support.type).name}s at up to ${mm(support.spacing)} mm centres: ${count} over ${frame.length.toFixed(2)} m.`)
      }
      if (fence) {
        const spec = fenceSpec(fence.type)
        const posts = fencePosts(frame.length, spec).length
        parts.push(`${spec.name}, ${mm(fence.height)} mm high: ${posts} posts.`)
      }
      return { text: parts.join(' '), error: false }
    }
    if (widthLimits && !widthAllowed) {
      const noun =
        widthKind === 'garage'
          ? 'a garage door'
          : widthKind === 'portal'
            ? 'a portal'
            : isFloorOpening(widthKind)
              ? 'a door'
              : 'a window'
      return { text: `This wall is too short for ${noun}.`, error: true }
    }
    if (selectedFitting) {
      const spec = fixtureSpec(selectedFitting.fixture.kind)
      const u = viewU(fixtureDrag?.id === selectedFitting.fixture.id ? fixtureDrag.u : selectedFitting.u)
      const y = fixtureDrag?.id === selectedFitting.fixture.id ? fixtureDrag.y : selectedFitting.fixture.y
      return {
        text: `${spec.name}, ${mm(y)} mm up, its middle ${mm(u)} mm from the left. Drag to move; Delete removes it.`,
        error: false,
      }
    }
    if (mode === 'place' && insertFixture && !readout) {
      return { text: `Click the wall to place a ${fixtureSpec(insertFixture).name.toLowerCase()}.`, error: false }
    }
    if (readout) {
      const shownU = side === -1 && frame ? frame.length - readout.u : readout.u
      const parts = [`u ${mm(shownU)} mm`, `v ${mm(readout.v)} mm`]
      if (selectedOpening) {
        parts.push(
          `width ${mm(selectedOpening.width)} mm`,
          `height ${mm(selectedOpening.height)} mm`,
          `sill ${mm(selectedOpening.v)} mm`,
          `head ${mm(selectedOpening.v + selectedOpening.height)} mm`,
        )
      }
      return { text: parts.join(', '), error: false }
    }
    if (!locked) return { text: 'Perspective. The fixed view is where this wall is edited.', error: false }
    if (clash) {
      const what = clash.through === 'window' ? 'a window' : 'a door'
      return {
        text: `The conduit for the ${clash.names[0].toLowerCase()} would run up through ${what}. Move the ${clash.names[0].toLowerCase()} along the wall, or the opening.`,
        error: true,
      }
    }
    if (pipeClash) {
      const what = pipeClash.through === 'window' ? 'a window' : 'a door'
      const pipe = { cold: 'cold water pipe', hot: 'hot water pipe', waste: 'waste pipe', gas: 'gas pipe' }[pipeClash.kind]
      return { text: `A ${pipe} would run through ${what}. Move the fitting along the wall, or the opening.`, error: true }
    }
    if (mode === 'place') return { text: `${insertHint(insertTool)} Hold Shift to place more than one; Esc goes back to selecting.`, error: false }
    if (wall.openings.length > 0 && scheduleLine) return { text: `${scheduleLine}. Click a window, door or fitting to select it.`, error: false }
    return { text: 'Click a window, door or fitting to select it, or choose Place to add one.', error: false }
  }

  function insertHint(kind: OpeningKind): string {
    if (kind === 'window') return 'Click the wall to place a window.'
    if (kind === 'garage') return 'Click the wall to place a garage door.'
    if (kind === 'external-door') return 'Click the wall to place an external door.'
    if (kind === 'internal-door') return 'Click the wall to place an internal door.'
    if (kind === 'portal') return 'Click the wall to place a portal.'
    return 'Click the wall to place a sliding door.'
  }

  function selectAdded(result: { ok: boolean; document: typeof doc }): void {
    if (!result.ok || !floor || !wall) return
    const id = result.document.building.floors
      .find((f) => f.id === floor.id)
      ?.walls.find((w) => w.id === wall.id)
      ?.openings.at(-1)?.id
    if (id) onSelectOpening?.(id)
  }

  function onViewportPointerMove(event: PointerEvent) {
    if (!locked || !floor || !wall) return
    const uv = uvFromEvent(event)
    if (!uv) return
    readout = uv

    const sliding = fixtureDrag
    if (sliding && frame) {
      const item = wallFittings.find((entry) => entry.fixture.id === sliding.id)
      if (!item) return
      const spec = fixtureSpec(item.fixture.kind)
      const half = fixtureSize(item.fixture).width / 2
      const u = snapFittingU(item.fixture.kind, Math.min(frame.length - half, Math.max(half, uv.u - sliding.grabU)), item.fixture.id)
      const y = spec.mount === 'wall' ? fitFixtureY(item.fixture.kind, snapFittingY(uv.v - sliding.grabV - ffl)) : item.fixture.y
      fixtureDrag = { ...sliding, u, y, moved: sliding.moved || Math.abs(u - item.u) > 0.01 || Math.abs(y - item.fixture.y) > 1e-6 }
      return
    }

    const current = drag
    if (!current || !frame) return
    const moving = wall.openings.find((opening) => opening.id === current.id)
    if (!moving) return
    const others = wall.openings.filter((opening) => opening.id !== current.id)
    const u = placeOpeningU(uv.u - current.grabU, moving.width, frame.length, others, undefined, gap)
    if (u === null) return
    const v = current.aligned ? current.v : uv.v - current.grabV
    drag = { ...current, u, v }
  }

  function onViewportPointerUp(event: PointerEvent) {
    const movingFitting = fixtureDrag
    if (movingFitting && floor && wall) {
      const item = wallFittings.find((entry) => entry.fixture.id === movingFitting.id)
      if (item && movingFitting.moved) {
        const moved = fixtureOnFace(floor, wall, item.side, item.fixture.kind, movingFitting.u, movingFitting.y, setupOf(item.fixture))
        if (moved) documentStore.updateFixture(floor.id, item.fixture.id, { x: moved.x, z: moved.z, dx: moved.dx, dz: moved.dz, y: moved.y })
      }
      fixtureDrag = null
    }
    const current = drag
    if (current && floor && wall && frame) {
      const moving = wall.openings.find((opening) => opening.id === current.id)
      if (moving) {
        const others = wall.openings.filter((opening) => opening.id !== current.id)
        const u = snapLegalModuleU(current.u, moving.width, frame.length, others, system)
        if (u !== null) {
          const moved =
            u !== current.originU || (!current.aligned && current.v !== current.originV)
          if (moved) {
            if (current.aligned) {
              documentStore.updateOpening(floor.id, wall.id, current.id, { u })
            } else {
              const vertical = snapOpeningVertical(current.v, moving.height, frame.height, system)
              documentStore.updateOpening(floor.id, wall.id, current.id, {
                u,
                v: vertical.v,
                height: vertical.height,
              })
            }
          }
        }
      }
    }
    drag = null
    const el = event.currentTarget
    if (el instanceof HTMLElement && el.hasPointerCapture(event.pointerId)) {
      el.releasePointerCapture(event.pointerId)
    }
  }
</script>

<div class="root">
  {#if !wall || !frame}
    <p class="empty">No wall selected</p>
  {:else}
    {#if logical}
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background px-3 py-1.5 text-sm">
        <div class="flex min-w-0 items-center gap-2">
          <span class="text-muted-foreground">Fence</span>
          <Select.Root type="single" value={fence?.type ?? 'none'} onValueChange={chooseFence}>
            <Select.Trigger size="sm" class="w-36 sm:w-44" aria-label="Fence">
              {fence ? fenceSpec(fence.type).name : 'None'}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="none">None</Select.Item>
              {#each FENCES as option (option.id)}
                <Select.Item value={option.id} label={option.name}>
                  <div class="grid max-w-64 gap-0.5 whitespace-normal">
                    <span>{option.name}</span>
                    <span class="text-xs text-muted-foreground">{option.text}</span>
                  </div>
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        {#if fence}
          <Separator orientation="vertical" class="hidden h-5 sm:block" />
          <label class="flex items-center gap-2">
            <span class="text-muted-foreground">Height</span>
            <Input
              class="h-7 w-20"
              type="number"
              min={mm(FENCE_MIN_HEIGHT_M)}
              max={mm(FENCE_MAX_HEIGHT_M)}
              step="100"
              value={mm(fence.height)}
              onchange={(event) => setFenceHeightMm(Number(event.currentTarget.value))}
            />
            <span class="text-muted-foreground">mm</span>
          </label>
        {/if}
        <Separator orientation="vertical" class="hidden h-5 sm:block" />
        <div class="flex min-w-0 items-center gap-2">
          <span class="text-muted-foreground">Supports</span>
          <Select.Root type="single" value={support?.type ?? 'none'} onValueChange={chooseSupport}>
            <Select.Trigger size="sm" class="w-36 sm:w-44" aria-label="Supports">
              {support ? supportSpec(support.type).name : 'None'}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="none">None</Select.Item>
              {#each SUPPORTS as option (option.id)}
                <Select.Item value={option.id} label={option.name}>
                  <div class="grid max-w-64 gap-0.5 whitespace-normal">
                    <span>{option.name}</span>
                    <span class="text-xs text-muted-foreground">{option.text}</span>
                  </div>
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        {#if support}
          <label class="flex items-center gap-2">
            <span class="text-muted-foreground">Spacing</span>
            <Input
              class="h-7 w-20"
              type="number"
              min={mm(SUPPORT_MIN_SPACING_M)}
              max={mm(SUPPORT_MAX_SPACING_M)}
              step="100"
              value={mm(support.spacing)}
              onchange={(event) => setSupportSpacingMm(Number(event.currentTarget.value))}
            />
            <span class="text-muted-foreground">mm</span>
          </label>
        {/if}
      {#if gutterValue}
        <div class="flex items-center gap-2 ">
          <span class="text-muted-foreground">Gutter</span>
          <Select.Root type="single" value={gutterValue} onValueChange={chooseGutter}>
            <Select.Trigger size="sm" class="w-36" aria-label="Gutter above this wall">
              {gutterValue === 'none' ? 'None here' : GUTTERS[gutterValue].name}
            </Select.Trigger>
            <Select.Content>
              {#each Object.entries(GUTTERS) as [id, spec] (id)}
                <Select.Item value={id} label={spec.name} />
              {/each}
              <Select.Item value="none" label="None above this wall" />
            </Select.Content>
          </Select.Root>
        </div>
      {/if}
      </div>
    {:else}
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background px-3 py-1.5 text-sm">
      <ToggleGroup.Root
        type="single"
        variant="outline"
        size="sm"
        value={mode}
        onValueChange={(next) => {
          if (next) mode = next as 'select' | 'place'
        }}
        aria-label="Focus tool"
      >
        <ToggleGroup.Item value="select" aria-label="Select" title="Select (V)"><MousePointer2 />Select</ToggleGroup.Item>
        <ToggleGroup.Item value="place" aria-label="Place" title="Place a window, door or fitting (P)"><Plus />Place</ToggleGroup.Item>
      </ToggleGroup.Root>
      <div class="flex items-center gap-2" hidden={mode !== 'place'}>
        <Select.Root type="single" value={insertValue} onValueChange={chooseInsert}>
          <Select.Trigger size="sm" class="w-36 sm:w-44" aria-label="What to place">
            {insertLabel}
          </Select.Trigger>
          <Select.Content>
            <Select.Group>
              <Select.Label>Openings</Select.Label>
              {#each insertChoices as choice (choice.kind)}
                <Select.Item value={choice.kind}>{choice.label}</Select.Item>
              {/each}
            </Select.Group>
            <Select.Group>
              <Select.Label>Fittings {viewFace?.outside ? 'outside' : 'inside'}</Select.Label>
              {#each fittingChoices as spec (spec.id)}
                <Select.Item value={`fitting:${spec.id}`} label={spec.name} />
              {/each}
            </Select.Group>
          </Select.Content>
        </Select.Root>
      </div>
      {#if !selectedFitting && widthLimits && widthAllowed && mode === 'place' && !insertFixture}
        <Separator orientation="vertical" class="hidden h-5 sm:block" />
        <label class="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <span class="shrink-0 text-muted-foreground">New width</span>
          <input
            class="min-w-0 flex-1 accent-primary sm:w-32 sm:flex-none"
            type="range"
            min={widthLimits.min}
            max={widthLimits.max}
            step="0.01"
            value={shownWidth}
            oninput={(event) => onWidthInput(Number(event.currentTarget.value))}
            onchange={(event) => commitWidth(Number(event.currentTarget.value))}
          />
          <Input
            class="h-7 w-20"
            type="number"
            min={mm(widthLimits.min)}
            max={mm(widthLimits.max)}
            step="10"
            value={mm(shownWidth)}
            onchange={(event) => {
              const next = Number(event.currentTarget.value) / 1000
              onWidthInput(next)
              commitWidth(next)
            }}
          />
          <span class="text-muted-foreground">mm</span>
        </label>
      {/if}
      {#if faceFinishNow}
        <div class="flex items-center gap-2 sm:ml-auto">
          <span class="text-muted-foreground">Finish</span>
          <Select.Root
            type="single"
            value={faceFinishNow.ownFinish ? faceFinishNow.finish : 'project'}
            onValueChange={(next) => next && chooseFinish({ finish: next === 'project' ? null : (next as WallFinish) })}
          >
            <Select.Trigger size="sm" class="w-28" aria-label="Finish on this face">{finishSpec(faceFinishNow.finish).name}</Select.Trigger>
            <Select.Content>
              <Select.Item value="project" label="As the project" />
              {#each WALL_FINISHES as spec (spec.id)}
                <Select.Item value={spec.id} label={spec.name} />
              {/each}
            </Select.Content>
          </Select.Root>
          {#if faceFinishNow.finish !== 'exposed'}
            <Select.Root
              type="single"
              value={faceFinishNow.ownPaint ? faceFinishNow.paint : 'project'}
              onValueChange={(next) => next && chooseFinish({ paint: next === 'project' ? null : next })}
            >
              <Select.Trigger size="sm" class="w-32" aria-label="Paint on this face">
                <span class="inline-block size-3 rounded-full border" style:background={faceFinishNow.colour}></span>
                {paintSpec(faceFinishNow.paint)?.name ?? 'Unpainted'}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="project" label="As the project" />
                {#each PAINTS as paint (paint.id)}
                  <Select.Item value={paint.id} label={paint.name} />
                {/each}
                <Select.Item value={NO_PAINT} label="Unpainted" />
              </Select.Content>
            </Select.Root>
          {/if}
        </div>
      {/if}
      {#if faceTrimNow}
        <div class="flex items-center gap-2">
          <span class="text-muted-foreground">Skirting</span>
          <Select.Root type="single" value={faceTrimNow.skirting} onValueChange={(next) => chooseTrim({ skirting: next as SkirtingType | 'none' })}>
            <Select.Trigger size="sm" class="w-28" aria-label="Skirting on this face">
              {faceTrimNow.skirting === 'none' ? 'None' : skirtingSpec(faceTrimNow.skirting).name}
            </Select.Trigger>
            <Select.Content>
              {#each SKIRTINGS as spec (spec.id)}
                <Select.Item value={spec.id} label={spec.name} />
              {/each}
              <Select.Item value="none" label="None" />
            </Select.Content>
          </Select.Root>
          <span class="text-muted-foreground">Cornice</span>
          <Select.Root type="single" value={faceTrimNow.cornice} onValueChange={(next) => chooseTrim({ cornice: next as CorniceType | 'none' })}>
            <Select.Trigger size="sm" class="w-28" aria-label="Cornice on this face">
              {faceTrimNow.cornice === 'none' ? 'None' : corniceSpec(faceTrimNow.cornice).name}
            </Select.Trigger>
            <Select.Content>
              {#each CORNICES as spec (spec.id)}
                <Select.Item value={spec.id} label={spec.name} />
              {/each}
              <Select.Item value="none" label="None" />
            </Select.Content>
          </Select.Root>
        </div>
      {/if}
      {#if gutterValue}
        <div class="flex items-center gap-2 {faceFinishNow ? '' : 'sm:ml-auto'}">
          <span class="text-muted-foreground">Gutter</span>
          <Select.Root type="single" value={gutterValue} onValueChange={chooseGutter}>
            <Select.Trigger size="sm" class="w-36" aria-label="Gutter above this wall">
              {gutterValue === 'none' ? 'None here' : GUTTERS[gutterValue].name}
            </Select.Trigger>
            <Select.Content>
              {#each Object.entries(GUTTERS) as [id, spec] (id)}
                <Select.Item value={id} label={spec.name} />
              {/each}
              <Select.Item value="none" label="None above this wall" />
            </Select.Content>
          </Select.Root>
        </div>
      {/if}
      <div class="flex w-full min-w-0 items-center gap-2 sm:w-auto {gutterValue || faceFinishNow ? '' : 'sm:ml-auto'}">
        <span class="text-muted-foreground">Wall</span>
        <Select.Root type="single" value={system.id} onValueChange={(next) => chooseSystem(next as WallSystemId)}>
          <Select.Trigger size="sm" class="w-full sm:w-48" aria-label="Wall system">{system.name}</Select.Trigger>
          <Select.Content>
            {#each WALL_SYSTEMS as choice (choice.id)}
              <Select.Item value={choice.id}>{choice.name}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
    </div>
    {/if}
    <div class="scene">
      <div class="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2">
        {#if onExit}
          <Button variant="outline" size="sm" class="shadow-xs" title="Back to the plan (Esc)" onclick={onExit}>
            <ArrowLeft />Back to plan
            <kbd class="ml-1 hidden rounded border px-1 font-sans text-[10px] text-muted-foreground sm:inline">Esc</kbd>
          </Button>
        {/if}
        <Button variant="outline" size="sm" class="shadow-xs" onclick={() => (locked = !locked)}>
          {locked ? 'Perspective' : 'Fixed view'}
        </Button>
        {#if viewFace && farFace}
          <Button
            variant="outline"
            size="sm"
            class="shadow-xs"
            title="Look at the other face of this wall (F)"
            onclick={flipSide}
          >
            <span class="text-muted-foreground">From</span>
            {viewFace.label}
            <ArrowLeftRight class="text-muted-foreground" />
            <span class="text-muted-foreground">{farFace.label}</span>
          </Button>
        {/if}
      </div>
      <div
        class="viewport"
        class:elevation={locked}
        class:placing={locked && mode === 'place'}
        onpointerdown={onViewportPointerDown}
        onpointermove={onViewportPointerMove}
        onpointerup={onViewportPointerUp}
        onpointercancel={onViewportPointerUp}
        role="presentation"
      >
      <ElevationScene
        {locked}
        frame={viewFrame ?? frame}
        wallGeometries={wallModel.blocks}
        courseGeometries={wallModel.courses}
        lintelGeometry={wallModel.lintel}
        frameGeometry={wallModel.frame}
        glassGeometry={wallModel.glass}
        panelMeshes={wallModel.panels}
        fenceParts={[
          ...fenceParts,
          ...pillarParts.map((part) => ({ ...part, opacity: 1 })),
          ...fittingParts.map((part) => ({ ...part, opacity: 1 })),
          ...gutterParts,
          ...finishParts,
          ...trimParts,
        ]}
        {orthoCamera}
        {onOrthoCamera}
      />
      {#if locked && displayWall}
        <ElevationDimensions
          length={frame.length}
          height={frame.height}
          head={logical ? Math.max(fence?.height ?? 0, support ? SUPPORT_HEIGHT_M : 0) : WALL_HEAD}
          openings={logical ? [] : shownOpenings(displayWall.openings)}
          selectedId={selectedOpeningId}
          floorLevel={floor?.index === 0 && !logical ? SURFACE_BED_TOP_ABOVE_DATUM_M : null}
          fittings={fittingMarks}
          {conduits}
          {ports}
          pipes={shownPipes}
        />
      {/if}
      </div>
      {#if selectedFitting && floor}
        {@const spec = fixtureSpec(selectedFitting.fixture.kind)}
        <ContextPanel label="Fitting" title={spec.name} description={spec.text} onclose={() => chooseFitting(null)}>
          <FittingSetup floorId={floor.id} fixture={selectedFitting.fixture} />
          <Button variant="destructive" onclick={removeSelectedFitting}>Remove</Button>
        </ContextPanel>
      {:else if editingOpening}
        <ContextPanel
          label="Opening"
          title={insertChoices.find((choice) => choice.kind === editingOpening.kind)?.label ?? 'Opening'}
          onclose={() => onSelectOpening?.(null)}
        >
          {#if widthLimits && widthAllowed}
            <div class="grid gap-1.5">
              <Label for="opening-width">Width (mm)</Label>
              <input
                class="w-full accent-primary"
                type="range"
                aria-label="Width"
                min={widthLimits.min}
                max={widthLimits.max}
                step="0.01"
                value={shownWidth}
                oninput={(event) => onWidthInput(Number(event.currentTarget.value))}
                onchange={(event) => commitWidth(Number(event.currentTarget.value))}
              />
              <Input
                id="opening-width"
                type="number"
                min={mm(widthLimits.min)}
                max={mm(widthLimits.max)}
                step="10"
                value={mm(shownWidth)}
                onchange={(event) => {
                  const next = Number(event.currentTarget.value) / 1000
                  onWidthInput(next)
                  commitWidth(next)
                }}
              />
            </div>
          {/if}
          <Button variant="destructive" onclick={removeSelected}>Remove opening</Button>
        </ContextPanel>
      {/if}
    </div>
  {/if}
</div>

<style>
  .viewport.placing {
    cursor: crosshair;
  }

  .root {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
  }

  .empty {
    margin: 1rem;
    font: 0.9375rem system-ui, sans-serif;
  }

  .scene {
    position: relative;
    display: flex;
    flex: 1;
    min-height: 0;
    width: 100%;
  }

  .viewport {
    position: relative;
    flex: 1;
    min-height: 0;
    width: 100%;
  }

  .viewport.elevation {
    cursor: crosshair;
  }

  .viewport :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
