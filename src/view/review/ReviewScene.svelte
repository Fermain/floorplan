<script lang="ts">
  import { Canvas, T } from '@threlte/core'
  import { OrbitControls, type IntersectionEvent } from '@threlte/extras'
  import {
    BoxGeometry,
    BufferGeometry,
    Color,
    DoubleSide,
    ExtrudeGeometry,
    Float32BufferAttribute,
    Path,
    Shape,
    ShapeGeometry,
  } from 'three'
  import { buildContourLines, CONTOUR_LIFT_M } from '../../lib/geometry/contours'
  import { deckPolygons, deckThickness, surfaceBedPolygons, type DeckPolygon } from '../../lib/geometry/deck'
  import {
    floorWorldDatum,
    groundPad,
    pointInRing,
    ringDistance,
    SURFACE_BED_THICKNESS_M,
    SURFACE_BED_TOP_ABOVE_DATUM_M,
    wallDatum,
  } from '../../lib/geometry/pad'
  import {
    buildOpeningFrameGeometry,
    buildOpeningGlassGeometry,
    buildOpeningPanelMeshes,
    FRAME_COLOUR,
    GLASS_COLOUR,
    GLASS_OPACITY,
    type OpeningPanelMesh,
  } from '../../lib/geometry/frames'
  import { buildCourseFaceGeometries, buildFinishSkin, buildLintelGeometry, buildWallGeometries } from '../../lib/geometry/walls'
  import { outsideFaces, resolveFinish } from '../../lib/geometry/finishes'
  import { buildRoofMeshes, masonryReach, roofInfills, WALL_HEAD_M, type RoofMeshes } from '../../lib/geometry/roof'
  import { coveringOf } from '../../lib/geometry/coverings'
  import { coveringTexture } from './roofTexture'
  import { floorTexture } from './floorTexture'
  import { floorFinishSpec } from '../../lib/model/floorFinishes'
  import { layoutSpaces } from '../../lib/geometry/spaces'
  import type { CanvasTexture } from 'three'
  import { buildGableGeometries } from '../../lib/geometry/gable'
  import { stairVoids } from '../../lib/geometry/stairs'
  import { supportingFloor } from '../../lib/model/stories'
  import { buildStairGeometry } from '../../lib/geometry/stairMesh'
  import { buildFenceParts, fenceFrame, type FencePart } from '../../lib/geometry/fence'
  import { buildPillarParts, type PillarPart } from '../../lib/geometry/pillars'
  import { buildRoadParts, type RoadPart } from '../../lib/geometry/roads'
  import { buildPavingParts, type PavingPart } from '../../lib/geometry/paving'
  import { buildCarportParts, type CarportPart } from '../../lib/geometry/carports'
  import { buildRetainingParts, pinchedGround, retainingDistance, RETAINING_GROUND_REACH_M, type RetainingPart } from '../../lib/geometry/retaining'
  import { buildCounterParts, type CounterPart } from '../../lib/geometry/counters'
  import { buildFixtureParts, finishedFloor, fixtureStandAboveDatum, fixtureWall, siteField, type FixturePart } from '../../lib/geometry/fixtures'
  import { fixtureFootprint, fixtureSize, fixtureSpec } from '../../lib/model/fixtures'
  import { wallLength } from '../../lib/model/geom'
  import ContextPanel from '../shared/ContextPanel.svelte'
  import FittingSetup from '../shared/FittingSetup.svelte'
  import { buildTrimParts, trimRuns, type TrimPart } from '../../lib/geometry/trims'
  import { powerLayout, type PanelSpot } from '../../lib/geometry/power'
  import { buildGutterParts, gutterLayout, gutterOf, type GutterPart } from '../../lib/geometry/gutters'
  import { floorSupports, type SupportPoint } from '../../lib/model/supports'
  import { systemOf, wallSystem } from '../../lib/model/systems'
  import type { SupportType } from '../../lib/model/types'
  import { FLOOR_TO_FLOOR } from '../../lib/plot/fixture'
  import { bilinearHeight, buildGroundGeometry, bottomSamplesAlong, padField } from '../../lib/geometry/terrain'
  import { documentStore } from '../../lib/state/document.svelte'
  import { sunDirection } from '../../lib/solar/sun'
  import type { Floor, Wall } from '../../lib/model/types'
  import type { OrbitControls as OrbitControlsInstance } from 'three/examples/jsm/controls/OrbitControls.js'
  import type { Ring } from '../../lib/geometry/pad'
  import { liftAboveGround } from './ground-limit'
  import ReviewSky from './ReviewSky.svelte'
  import ReviewInteractivity from './ReviewInteractivity.svelte'
  import ReviewCutaway from './ReviewCutaway.svelte'
  import ReviewXray from './ReviewXray.svelte'
  import { buildServiceParts, serviceRuns, type ServicePart } from '../../lib/geometry/serviceRuns'
  import { isCutAway, type CutShape, type WallView } from './cutaway'
  import { Button } from '$lib/components/ui/button'

  interface Props {
    sunDate: Date
    onSelectWall?: (wallId: string) => void
    // How far ahead of the camera the cutaway reaches (0 for none), how the walls show, and the top storey shown.
    cutDepth?: number
    cutShape?: CutShape
    walls?: WallView
    upTo?: number | null
    // Whether the roofs are drawn, with their gutters and gables.
    roofs?: boolean
    // Called once the model has first been built, so whatever is waiting on it can stand down.
    onReady?: () => void
    // Whether the building fades to show the services running through it.
    xray?: boolean
  }

  let { sunDate, onSelectWall, cutDepth = 0, cutShape = 'box', walls = 'full', upTo = null, roofs = true, xray = false, onReady }: Props = $props()
  let announced = false

  // The pipes and cables, built only while they are being looked at.
  const serviceParts = $derived.by((): ServicePart[] => (xray ? buildServiceParts(serviceRuns(doc)) : []))
  $effect(() => {
    const parts = serviceParts
    return () => {
      for (const part of parts) part.geometry.dispose()
    }
  })

  type WallMeshes = {
    key: string
    floorId: string
    wallId: string
    datumY: number
    geoms: BufferGeometry[]
    courses: BufferGeometry[]
    lintel: BufferGeometry | null
    frame: BufferGeometry | null
    glass: BufferGeometry | null
    panels: OpeningPanelMesh[]
    // Plaster or bagging over a face, in its paint colour; bagging lets the coursing show through.
    skins: { geometry: BufferGeometry; colour: string; opacity: number }[]
  }
  type FloorSlab = { key: string; storey: number; geometry: BufferGeometry; y: number; color: string; polygonOffset?: boolean }
  type RoofMesh = {
    key: string
    meshes: RoofMeshes
    texture: CanvasTexture | null
    colour: string
    // The gable built up over each end wall, with the colour of that wall's outside finish if it has one.
    gables: { body: BufferGeometry | null; faces: BufferGeometry | null; colour: string | null }[]
    panels: BufferGeometry | null
    gutters: GutterPart[]
    y: number
  }
  type StairMesh = { key: string; storey: number; geometry: BufferGeometry; y: number }

  const DECK_THICKNESS = deckThickness()
  const FLOOR_COVER_LIFT_M = 0.006

  let locked = $state(false)
  let groundGeometry = $state<BufferGeometry | null>(null)
  let roadMeshes = $state<RoadPart[]>([])
  let pavingMeshes = $state<PavingPart[]>([])
  let carportMeshes = $state<CarportPart[]>([])
  let retainingMeshes = $state<RetainingPart[]>([])
  let counterMeshes = $state<{ key: string; datum: number; parts: CounterPart[] }[]>([])
  // How far the ground carries on past the survey.
  const SURROUNDINGS_M = 120
  const LAWN = '#6a8f5c'
  const VELD = '#8f9468'
  let contourMinor = $state<BufferGeometry | null>(null)
  let contourMajor = $state<BufferGeometry | null>(null)
  let wallMeshes = $state<WallMeshes[]>([])
  let floorSlabs = $state<FloorSlab[]>([])
  // The finish laid in each room: tiles, boards, carpet, lying just over the slab or deck.
  type FloorCover = { key: string; storey: number; geometry: BufferGeometry; y: number; colour: string; texture: CanvasTexture | null }
  let floorCovers = $state<FloorCover[]>([])
  let roofMeshes = $state<RoofMesh[]>([])
  let stairMeshes = $state<StairMesh[]>([])
  let fenceMeshes = $state<{ key: string; parts: FencePart[] }[]>([])
  let pillarMeshes = $state<{ key: string; parts: PillarPart[] }[]>([])
  let fixtureMeshes = $state<{ key: string; datum: number; parts: FixturePart[] }[]>([])
  let trimMeshes = $state<{ key: string; datum: number; parts: TrimPart[] }[]>([])
  const doc = $derived(documentStore.document)

  const plotCenter = $derived.by(() => {
    const ring = doc.plot.ring
    let sx = 0
    let sz = 0
    for (const [x, z] of ring) {
      sx += x
      sz += z
    }
    const n = ring.length || 1
    return { x: sx / n, y: 2, z: sz / n }
  })

  // Plan coordinates run x east and z north. three.js is right-handed with y up, so drawn as they stand the
  // model would be a mirror image of the plan. The scene is therefore drawn with z turned over: in the 3D world
  // z runs south. Everything placed in the world from plan coordinates outside the mirrored group (the camera,
  // the sun, the sky) goes through here, and points picked in the world come back the same way.
  const across = (z: number) => -z

  let stableTarget: [number, number, number] = [0, 2, 0]
  let stableCamera: [number, number, number] = [14, 12, 14]

  function sameTriple(a: [number, number, number], b: [number, number, number]) {
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
  }

  // The camera looks at the building, from far enough back to take it all in; on an empty plot, at the plot.
  const focus = $derived.by(() => {
    // Solid walls only: fences round the boundary would frame the whole plot.
    const corners = doc.building.floors.flatMap((floor) =>
      floor.walls
        .filter((wall) => wall.skin !== 'logical')
        .flatMap((wall) => [wall.startCornerId, wall.endCornerId])
        .flatMap((id) => floor.corners.filter((corner) => corner.id === id)),
    )
    if (corners.length === 0) return { x: plotCenter.x, z: plotCenter.z, reach: 14 }
    const xs = corners.map((corner) => corner.x)
    const zs = corners.map((corner) => corner.z)
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs))
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2, reach: Math.max(14, size * 1.1) }
  })

  const orbitTarget = $derived.by(() => {
    const next: [number, number, number] = [focus.x, plotCenter.y, across(focus.z)]
    if (sameTriple(stableTarget, next)) return stableTarget
    stableTarget = next
    return stableTarget
  })

  const cameraPosition = $derived.by(() => {
    const next: [number, number, number] = [focus.x + focus.reach, plotCenter.y + focus.reach * 0.7, across(focus.z + focus.reach)]
    if (sameTriple(stableCamera, next)) return stableCamera
    stableCamera = next
    return stableCamera
  })

  const sunOnPlan = $derived(
    sunDirection(
      sunDate,
      doc.plot.latitude,
      doc.plot.longitude,
      doc.plot.northBearingDeg,
    ),
  )
  // The way to the sun in the 3D world.
  const sun = $derived({ x: sunOnPlan.x, y: sunOnPlan.y, z: across(sunOnPlan.z) })

  // The sun fades as it sets: no light, and no shadows thrown upwards, from below the horizon.
  const sunStrength = $derived(1.25 * Math.min(1, Math.max(0, (sun.y + 0.02) / 0.15)))

  // The shadows cover the whole plot, however big it is.
  const shadowReach = $derived.by(() => {
    let reach = 0
    for (const [x, z] of doc.plot.ring) reach = Math.max(reach, Math.hypot(x - plotCenter.x, z - plotCenter.z))
    return Math.max(24, reach + 6)
  })

  const lightPosition = $derived([
    plotCenter.x + sun.x * (20 + shadowReach),
    plotCenter.y + sun.y * (20 + shadowReach),
    across(plotCenter.z) + sun.z * (20 + shadowReach),
  ] as [number, number, number])

  function bottomSamplesForWall(floor: Floor, wall: Wall) {
    if (floor.index !== 0 || wallDatum(floor, wall, groundPad(doc)) !== null) {
      return undefined
    }
    const start = floor.corners.find((c) => c.id === wall.startCornerId)
    const end = floor.corners.find((c) => c.id === wall.endCornerId)
    if (!start || !end) {
      return undefined
    }
    const field = doc.heightfield
    const raw = bottomSamplesAlong(field, start.x, start.z, end.x, end.z)
    return raw.map((s) => ({ u: s.u, y: s.y - floor.datumHeight }))
  }

  // What is picked in the scene: a wall, or a fitting. Hovering shows what a click would pick.
  type Pick = { kind: 'wall'; floorId: string; wallId: string } | { kind: 'fixture'; floorId: string; fixtureId: string }
  let selected = $state<Pick | null>(null)
  let hovered = $state<Pick | null>(null)
  // While the camera is being turned, nothing under the pointer is highlighted.
  let orbiting = $state(false)

  const same = (a: Pick | null, b: Pick | null) =>
    a !== null && b !== null && a.kind === b.kind && a.floorId === b.floorId && (a.kind === 'wall' ? a.wallId === (b as typeof a).wallId : a.fixtureId === (b as typeof a).fixtureId)

  // Storeys above the one chosen are lifted off, with the roof; walls may be cut at waist height or hidden.
  const HALF_WALL_M = 1.2
  const storeyOf = $derived(Object.fromEntries(doc.building.floors.map((floor) => [floor.id, floor.index])) as Record<string, number>)
  const shown = (storey: number | undefined) => upTo === null || (storey ?? 0) <= upTo
  const shownFloor = (floorId: string) => shown(storeyOf[floorId])
  // With half walls, everything on a storey is cut at the same height above its floor: walls, trims and fittings.
  const halfCut = (datum: number) => (walls === 'half' ? { cutAbove: datum + HALF_WALL_M } : {})

  const storeyName = (index: number) => (index === 0 ? 'the ground floor' : `storey ${index + 1}`)

  // A click that moved is the end of an orbit, not a pick.
  const DRAG_PX = 4

  function wallPick(wall: WallMeshes): Pick {
    return { kind: 'wall', floorId: wall.floorId, wallId: wall.wallId }
  }

  function wallHandlers(wall: WallMeshes) {
    return {
      onclick: (event: IntersectionEvent<MouseEvent>) => {
        if (isCutAway(event.point, event.object)) return
        event.stopPropagation()
        if (event.delta > DRAG_PX) return
        selected = wallPick(wall)
      },
      ondblclick: (event: IntersectionEvent<MouseEvent>) => {
        if (isCutAway(event.point, event.object)) return
        event.stopPropagation()
        onSelectWall?.(wall.wallId)
      },
      onpointermove: (event: IntersectionEvent<PointerEvent>) => {
        if (isCutAway(event.point, event.object)) return
        event.stopPropagation()
        if (orbiting) return
        if (!same(hovered, wallPick(wall))) hovered = wallPick(wall)
      },
      onpointerleave: () => {
        if (hovered?.kind === 'wall' && hovered.wallId === wall.wallId) hovered = null
      },
    }
  }

  // Fittings are merged into one mesh per finish, so the fitting is the one standing where the pointer hit.
  function fixtureAtPoint(floorId: string, point: { x: number; y: number; z: number }): Pick | null {
    const floor = doc.building.floors.find((item) => item.id === floorId)
    if (!floor) return null
    let best: { id: string; d: number } | null = null
    for (const fixture of floor.fixtures ?? []) {
      const ring = fixtureFootprint(fixture).map((p) => ({ x: p.x, z: p.z }))
      const d = pointInRing(ring, point.x, across(point.z)) ? 0 : ringDistance(ring, point.x, across(point.z))
      if (d < 0.15 && (!best || d < best.d)) best = { id: fixture.id, d }
    }
    return best ? { kind: 'fixture', floorId, fixtureId: best.id } : null
  }

  function fixtureHandlers(floorId: string) {
    return {
      onclick: (event: IntersectionEvent<MouseEvent>) => {
        if (isCutAway(event.point, event.object)) return
        event.stopPropagation()
        if (event.delta > DRAG_PX) return
        selected = fixtureAtPoint(floorId, event.point)
      },
      onpointermove: (event: IntersectionEvent<PointerEvent>) => {
        if (isCutAway(event.point, event.object)) return
        event.stopPropagation()
        if (orbiting) return
        const pick = fixtureAtPoint(floorId, event.point)
        if (!same(hovered, pick)) hovered = pick
      },
      onpointerleave: () => {
        if (hovered?.kind === 'fixture') hovered = null
      },
    }
  }

  function clearPick(event: IntersectionEvent<MouseEvent>) {
    event.stopPropagation()
    if (event.delta > DRAG_PX) return
    selected = null
  }

  const highlightedWalls = $derived.by(() => {
    const out: { key: string; wall: WallMeshes; colour: string; opacity: number }[] = []
    for (const [pick, colour, opacity] of [
      [selected, '#2563eb', 0.4],
      [hovered, '#60a5fa', 0.25],
    ] as const) {
      if (pick?.kind !== 'wall') continue
      if (pick === hovered && same(selected, hovered)) continue
      const wall = wallMeshes.find((item) => item.floorId === pick.floorId && item.wallId === pick.wallId)
      if (wall && walls !== 'hidden' && shownFloor(wall.floorId)) out.push({ key: `${colour}:${wall.key}`, wall, colour, opacity })
    }
    return out
  })

  // A box drawn round the fitting picked or under the pointer.
  const fixtureBoxes = $derived.by(() => {
    const out: { key: string; position: [number, number, number]; size: [number, number, number]; turn: number; colour: string }[] = []
    for (const [pick, colour] of [
      [selected, '#2563eb'],
      [hovered, '#60a5fa'],
    ] as const) {
      if (pick?.kind !== 'fixture') continue
      if (pick === hovered && same(selected, hovered)) continue
      const floor = doc.building.floors.find((item) => item.id === pick.floorId)
      const fixture = floor?.fixtures?.find((item) => item.id === pick.fixtureId)
      const datum = fixtureMeshes.find((item) => item.key === pick.floorId)?.datum
      if (!floor || !fixture || datum === undefined) continue
      const size = fixtureSize(fixture)
      const base = datum + fixtureStandAboveDatum(doc, floor, fixture) + fixture.y
      out.push({
        key: `${colour}:${fixture.id}`,
        position: [fixture.x, base + size.height / 2, fixture.z],
        size: [size.width + 0.04, size.height + 0.04, size.depth + 0.04],
        turn: Math.atan2(fixture.dx, fixture.dz),
        colour,
      })
    }
    return out
  })

  const chosenWall = $derived.by(() => {
    if (selected?.kind !== 'wall') return null
    const pick = selected
    const floor = doc.building.floors.find((item) => item.id === pick.floorId)
    const wall = floor?.walls.find((item) => item.id === pick.wallId)
    return floor && wall ? { floor, wall } : null
  })

  const chosenFixture = $derived.by(() => {
    if (selected?.kind !== 'fixture') return null
    const pick = selected
    const floor = doc.building.floors.find((item) => item.id === pick.floorId)
    const fixture = floor?.fixtures?.find((item) => item.id === pick.fixtureId)
    return floor && fixture ? { floor, fixture, onWall: fixtureWall(floor, fixture) } : null
  })

  // A pick that no longer exists, after an undo or a removal, is dropped.
  $effect(() => {
    if (selected && !chosenWall && !chosenFixture) selected = null
  })

  $effect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !selected) return
      event.preventDefault()
      selected = null
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  $effect(() => {
    const floors = doc.building.floors
    const pad = groundPad(doc)
    const displayField = siteField(doc)
    // The ground runs on past the survey to the horizon; contours stay on the surveyed part.
    const surroundings = padField(displayField, SURROUNDINGS_M)
    // Kept lawn inside the boundary, fading to dry veld beyond it.
    const ring = doc.plot.ring.map(([x, z]) => ({ x, z }))
    const lawn = new Color(LAWN)
    const veld = new Color(VELD)
    const tint = new Color()
    // The ground as it lies, and as it is drawn: brought in to meet the top and the foot of each retaining wall.
    const lies = (x: number, z: number) => bilinearHeight(surroundings, x, z)
    const groundAt = pinchedGround(doc, lies)
    const held = (doc.retaining ?? []).length > 0
    const nearWall = RETAINING_GROUND_REACH_M + surroundings.cellSize * 0.75
    const ground = buildGroundGeometry(
      surroundings,
      (x, z) => {
        const out = pointInRing(ring, x, z) ? 0 : Math.min(1, ringDistance(ring, x, z) / 4)
        tint.copy(lawn).lerp(veld, out)
        return [tint.r, tint.g, tint.b]
      },
      held ? { fine: (x, z) => retainingDistance(doc, x, z) < nearWall, heightAt: groundAt, divisions: Math.max(2, Math.round(surroundings.cellSize / 0.125)) } : undefined,
    )
    const contours = buildContourLines(displayField, CONTOUR_LIFT_M)
    const roadParts = buildRoadParts(doc.plot, groundAt)
    const pavingParts = buildPavingParts(doc, groundAt)
    const carportParts = buildCarportParts(doc, groundAt)
    const retainingParts = buildRetainingParts(doc, lies)
    // A contour is left out where the ground under it has been drawn in to a wall.
    const settled = (lines: Float32Array) => (held ? lines.filter((_, i) => {
      const at = i - (i % 6)
      return [0, 3].every((o) => Math.abs(groundAt(lines[at + o], lines[at + o + 2]) - lies(lines[at + o], lines[at + o + 2])) < 0.004)
    }) : lines)
    const minor = lineGeometry(settled(contours.minor))
    const major = lineGeometry(settled(contours.major))
    const built: WallMeshes[] = []
    const fences: { key: string; parts: FencePart[] }[] = []
    const pillars: { key: string; parts: PillarPart[] }[] = []
    const system = wallSystem(doc.building.wallSystemId)
    for (const floor of floors) {
      const groups: Record<string, { type: SupportType; datum: number; spots: SupportPoint[] }> = {}
      for (const spot of floorSupports(floor)) {
        const wall = floor.walls.find((item) => item.id === spot.wallId)
        const datum = wall ? floorWorldDatum(floor.datumHeight, wallDatum(floor, wall, pad) ?? 0) : floor.datumHeight
        const key = `${spot.support.type}@${datum}`
        groups[key] ??= { type: spot.support.type, datum, spots: [] }
        groups[key].spots.push(spot)
      }
      for (const [key, group] of Object.entries(groups)) {
        pillars.push({ key: `${floor.id}:${key}`, parts: buildPillarParts(group.type, group.spots, system, group.datum) })
      }
      const outside = outsideFaces(floor)
      for (const wall of floor.walls) {
        if (wall.skin === 'logical') {
          const line = wall.fence ? fenceFrame(floor, wall) : null
          if (!line || !wall.fence) continue
          const datum = floorWorldDatum(floor.datumHeight, wallDatum(floor, wall, pad) ?? 0)
          const baseAt =
            floor.index === 0
              ? (u: number) =>
                  bilinearHeight(displayField, line.start.x + line.dir.x * u, line.start.z + line.dir.z * u)
              : () => datum
          fences.push({ key: `${floor.id}:${wall.id}`, parts: buildFenceParts(line, wall.fence, baseAt) })
          continue
        }
        const samples = bottomSamplesForWall(floor, wall)
        const head = continuingFacadeHead(floor, wall)
        const geoms = buildWallGeometries(floor, wall, samples, head)
        const courses = buildCourseFaceGeometries(floor, wall, samples, head)
        const lintel = buildLintelGeometry(floor, wall)
        const frame = buildOpeningFrameGeometry(floor, wall, samples)
        const glass = buildOpeningGlassGeometry(floor, wall, samples)
        const panels = buildOpeningPanelMeshes(floor, wall, samples)
        const skins: WallMeshes['skins'] = []
        for (const side of [1, -1] as const) {
          const finish = resolveFinish(doc, wall, side, outside(wall, side))
          if (finish.finish === 'exposed' || !finish.colour) continue
          const geometry = buildFinishSkin(floor, wall, side, samples, head)
          if (geometry) skins.push({ geometry, colour: finish.colour, opacity: finish.finish === 'bagged' ? 0.82 : 1 })
        }
        if (geoms.length === 0 && courses.length === 0 && !lintel && !frame && !glass && panels.length === 0) continue
        built.push({
          key: `${floor.id}:${wall.id}`,
          floorId: floor.id,
          wallId: wall.id,
          datumY: floorWorldDatum(floor.datumHeight, wallDatum(floor, wall, pad) ?? 0),
          geoms,
          courses,
          lintel,
          frame,
          glass,
          panels,
          skins,
        })
      }
    }
    const slabs = pad ? [...slabsFor(pad.structures), ...decksFor(floors, pad)] : []
    const covers = floors.flatMap((floor) => coversFor(floor, floorWorldDatum(floor.datumHeight, supportGrade(floor, pad)) + finishedFloor(floor)))
    const roofs = roofsFor(pad)
    const stairs = stairsFor(pad)
    const trims = floors.map((floor) => {
      const datum = floorWorldDatum(floor.datumHeight, supportGrade(floor, pad))
      return { key: floor.id, datum, parts: buildTrimParts(trimRuns(doc, floor), floor, datum) }
    })
    const fittings = floors
      .filter((floor) => (floor.fixtures ?? []).length > 0)
      .map((floor) => {
        const datum = floorWorldDatum(floor.datumHeight, supportGrade(floor, pad))
        return {
          key: floor.id,
          datum,
          parts: buildFixtureParts(floor.fixtures ?? [], (fixture) => datum + fixtureStandAboveDatum(doc, floor, fixture), floor.counters ?? []),
        }
      })
    const counters = floors
      .filter((floor) => (floor.counters ?? []).length > 0)
      .map((floor) => {
        const datum = floorWorldDatum(floor.datumHeight, supportGrade(floor, pad))
        return { key: floor.id, datum, parts: buildCounterParts(floor.counters ?? [], datum + finishedFloor(floor), floor.fixtures ?? []) }
      })
    counterMeshes = counters
    groundGeometry = ground
    roadMeshes = roadParts
    pavingMeshes = pavingParts
    carportMeshes = carportParts
    retainingMeshes = retainingParts
    contourMinor = minor
    contourMajor = major
    wallMeshes = built
    floorSlabs = slabs
    floorCovers = covers
    roofMeshes = roofs
    stairMeshes = stairs
    fenceMeshes = fences
    pillarMeshes = pillars
    fixtureMeshes = fittings
    trimMeshes = trims
    if (!announced) {
      announced = true
      // After the meshes have been handed over, so the first frame with the house in it can follow.
      setTimeout(() => onReady?.(), 0)
    }
    return () => {
      for (const trim of trims) for (const part of trim.parts) part.geometry.dispose()
      for (const fitting of fittings) for (const part of fitting.parts) part.geometry.dispose()
      for (const counter of counters) for (const part of counter.parts) part.geometry.dispose()
      for (const pillar of pillars) for (const part of pillar.parts) part.geometry.dispose()
      for (const fence of fences) for (const part of fence.parts) part.geometry.dispose()
      ground.dispose()
      for (const part of roadParts) part.geometry.dispose()
      for (const part of pavingParts) part.geometry.dispose()
      for (const part of carportParts) part.geometry.dispose()
      for (const part of retainingParts) part.geometry.dispose()
      minor?.dispose()
      major?.dispose()
      for (const wall of built) {
        for (const g of wall.geoms) g.dispose()
        for (const g of wall.courses) g.dispose()
        wall.lintel?.dispose()
        wall.frame?.dispose()
        wall.glass?.dispose()
        for (const panel of wall.panels) panel.geometry.dispose()
        for (const skin of wall.skins) skin.geometry.dispose()
      }
      for (const slab of slabs) slab.geometry.dispose()
      for (const cover of covers) cover.geometry.dispose()
      for (const roof of roofs) {
        roof.meshes.top?.dispose()
        roof.meshes.under?.dispose()
        roof.meshes.edges?.dispose()
        for (const gable of roof.gables) gable.body?.dispose()
        roof.panels?.dispose()
        for (const part of roof.gutters) part.geometry.dispose()
        for (const gable of roof.gables) gable.faces?.dispose()
      }
      for (const stair of stairs) stair.geometry.dispose()
    }
  })

  function continuingFacadeHead(floor: Floor, wall: Wall): number | undefined {
    const unitId = floor.corners.find((corner) => corner.id === wall.startCornerId)?.unitId ?? floor.unitId
    if (!unitId) return undefined
    const above = doc.building.floors.some(
      (item) =>
        item.unitId === unitId &&
        item.index === floor.index + 1 &&
        item.walls.some((itemWall) => itemWall.skin !== 'logical'),
    )
    return above ? FLOOR_TO_FLOOR : undefined
  }

  function panelGeometry(spots: PanelSpot[]): BufferGeometry | null {
    if (spots.length === 0) return null
    const positions: number[] = []
    for (const { corners: [a, b, c, d] } of spots) {
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z)
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.computeVertexNormals()
    return geometry
  }

  function roofsFor(pad: ReturnType<typeof groundPad>): RoofMesh[] {
    const solar = powerLayout(doc)
    const eaves = gutterLayout(doc)
    const field = siteField(doc)
    const meshes: RoofMesh[] = []
    // Rainwater tanks stand on exterior grade above the ground-floor datum; downpipes into them stop there.
    const ground = doc.building.floors.find((item) => item.index === 0)
    const groundDatum = ground ? floorWorldDatum(ground.datumHeight, supportGrade(ground, pad)) : undefined
    for (const floor of doc.building.floors) {
      const roof = floor.roof
      if (!roof || floor.index === 0) continue
      const below = supportingFloor(doc, floor)
      const reach = masonryReach(below?.walls ?? [])
      const built = buildRoofMeshes(floor, roof, reach)
      if (!built.top) continue
      const spec = coveringOf(roof)
      // A gable is plastered and painted with the wall it stands on, on the face that looks outside.
      const outside = below ? outsideFaces(below) : null
      const gables = below
        ? roofInfills(below, floor, roof, reach).map((infill) => {
            const side = outside?.(infill.wall, 1) ? 1 : -1
            const finish = resolveFinish(doc, infill.wall, side, outside?.(infill.wall, side) ?? true)
            return { ...buildGableGeometries(below, [infill]), colour: finish.colour }
          })
        : []
      const grade = below ? supportGrade(below, pad) : outlineGrade(floor, pad)
      const supportDatum = below?.datumHeight ?? floor.datumHeight - FLOOR_TO_FLOOR
      meshes.push({
        key: floor.id,
        meshes: built,
        texture: coveringTexture(spec),
        colour: spec.colour,
        gables,
        panels: panelGeometry(solar.panelSpots.filter((spot) => spot.floorId === floor.id)),
        gutters: buildGutterParts(
          eaves,
          floor.id,
          gutterOf(roof),
          (x, z) => bilinearHeight(field, x, z) - (floorWorldDatum(supportDatum, grade) + WALL_HEAD_M),
          groundDatum === undefined ? undefined : groundDatum - (floorWorldDatum(supportDatum, grade) + WALL_HEAD_M),
        ),
        y: floorWorldDatum(supportDatum, grade) + WALL_HEAD_M,
      })
    }
    return meshes
  }

  function stairsFor(pad: ReturnType<typeof groundPad>): StairMesh[] {
    const meshes: StairMesh[] = []
    for (const floor of doc.building.floors) {
      for (const stair of floor.stairs ?? []) {
        const geometry = buildStairGeometry(stair, floor.index)
        if (!geometry) continue
        meshes.push({
          key: stair.id,
          storey: floor.index,
          geometry,
          y: floorWorldDatum(floor.datumHeight, supportGrade(floor, pad)),
        })
      }
    }
    return meshes
  }

  function supportGrade(floor: Floor, pad: ReturnType<typeof groundPad>): number {
    if (!pad) return 0
    for (const wall of floor.walls) {
      const datum = wallDatum(floor, wall, pad)
      if (datum !== null) return datum
    }
    return 0
  }

  function outlineGrade(floor: Floor, pad: ReturnType<typeof groundPad>): number {
    if (!pad) return 0
    const ring = floor.outline?.[0] ?? []
    if (ring.length === 0) return 0
    const x = ring.reduce((sum, point) => sum + point.x, 0) / ring.length
    const z = ring.reduce((sum, point) => sum + point.z, 0) / ring.length
    return pad.structures.find((structure) => structure.rings.some((item) => pointInRing(item, x, z)))?.datum ?? 0
  }

  function slabsFor(structures: { datum: number; rings: Ring[] }[]): FloorSlab[] {
    const slabs: FloorSlab[] = []
    const groundFloor = doc.building.floors.find((floor) => floor.index === 0)
    structures.forEach((structure, structureIndex) => {
      surfaceBedPolygons(structure.rings, groundFloor).forEach((polygon, polygonIndex) => {
        if (polygon.outer.length < 3) return
        const shape = ringShape(polygon.outer)
        for (const hole of polygon.holes) {
          if (hole.length < 3) continue
          shape.holes.push(ringPath(hole))
        }
        const geometry = new ExtrudeGeometry(shape, {
          depth: SURFACE_BED_THICKNESS_M,
          bevelEnabled: false,
        })
        geometry.rotateX(-Math.PI / 2)
        slabs.push({
          key: `${structureIndex}-${polygonIndex}`,
          storey: 0,
          geometry,
          y: structure.datum + SURFACE_BED_TOP_ABOVE_DATUM_M - SURFACE_BED_THICKNESS_M,
          color: '#a3a3a3',
        })
      })
    })
    return slabs
  }

  // A thin sheet over each named room, in its floor finish, with any stair well cut out of it.
  function coversFor(floor: Floor, datum: number): FloorCover[] {
    if (floor.roof) return []
    const voids = stairVoids(doc, floor)
    const covers: FloorCover[] = []
    for (const resolved of layoutSpaces(floor).spaces) {
      if (resolved.space.finish === 'none') continue
      const spec = floorFinishSpec(resolved.space.finish)
      resolved.cells.forEach((cell, index) => {
        if (cell.net.length < 3) return
        const shape = ringShape(cell.net)
        for (const hole of voids) {
          if (hole.length >= 3 && hole.every((point) => pointInRing(cell.net, point.x, point.z))) shape.holes.push(ringPath(hole))
        }
        const geometry = new ShapeGeometry(shape)
        geometry.rotateX(-Math.PI / 2)
        covers.push({
          key: `cover-${floor.id}-${resolved.space.id}-${index}`,
          storey: floor.index,
          geometry,
          y: datum + FLOOR_COVER_LIFT_M,
          colour: spec.colour,
          texture: floorTexture(spec),
        })
      })
    }
    return covers
  }

  function decksFor(
    floors: Floor[],
    pad: NonNullable<ReturnType<typeof groundPad>>,
  ): FloorSlab[] {
    const decks: FloorSlab[] = []
    for (const floor of floors) {
      if (floor.index === 0 || floor.roof) continue
      const polygons = deckPolygons(floor, stairVoids(doc, floor))
      const grade = deckGrade(floor, pad, polygons)
      polygons.forEach((polygon, index) => {
        if (polygon.outer.length < 3) return
        const shape = ringShape(polygon.outer)
        for (const hole of polygon.holes) {
          if (hole.length < 3) continue
          shape.holes.push(ringPath(hole))
        }
        const geometry = new ExtrudeGeometry(shape, { depth: DECK_THICKNESS, bevelEnabled: false })
        geometry.rotateX(-Math.PI / 2)
        decks.push({
          key: `deck-${floor.id}-${index}`,
          storey: floor.index,
          geometry,
          y: floorWorldDatum(floor.datumHeight, grade) - DECK_THICKNESS,
          color: '#d6d3d1',
          polygonOffset: true,
        })
      })
    }
    return decks
  }

  function deckGrade(
    floor: Floor,
    pad: NonNullable<ReturnType<typeof groundPad>>,
    polygons: DeckPolygon[],
  ): number {
    for (const wall of floor.walls) {
      const datum = wallDatum(floor, wall, pad)
      if (datum !== null) return datum
    }
    const ring = polygons[0]?.outer ?? []
    if (ring.length === 0) return 0
    const x = ring.reduce((sum, point) => sum + point.x, 0) / ring.length
    const z = ring.reduce((sum, point) => sum + point.z, 0) / ring.length
    return pad.structures.find((structure) => structure.rings.some((item) => pointInRing(item, x, z)))?.datum ?? 0
  }

  function ringShape(ring: Ring): Shape {
    const shape = new Shape()
    shape.moveTo(ring[0].x, -ring[0].z)
    for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i].x, -ring[i].z)
    shape.closePath()
    return shape
  }

  function ringPath(ring: Ring): Path {
    const path = new Path()
    path.moveTo(ring[0].x, -ring[0].z)
    for (let i = 1; i < ring.length; i++) path.lineTo(ring[i].x, -ring[i].z)
    path.closePath()
    return path
  }

  function lineGeometry(positions: Float32Array): BufferGeometry | null {
    if (positions.length < 6) return null
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    return geometry
  }

  function configureSunLight(light: import('three').DirectionalLight) {
    light.target.position.set(plotCenter.x, plotCenter.y, across(plotCenter.z))
    light.shadow.mapSize.set(2048, 2048)
    light.shadow.camera.near = 1
    light.shadow.camera.far = 40 + shadowReach * 2
    light.shadow.bias = -0.0004
    light.shadow.normalBias = 0.02
    const extent = shadowReach
    light.shadow.camera.left = -extent
    light.shadow.camera.right = extent
    light.shadow.camera.top = extent
    light.shadow.camera.bottom = -extent
    light.shadow.camera.updateProjectionMatrix()
  }

  function keepCameraAboveGround(controls: OrbitControlsInstance) {
    const displayField = siteField(doc)
    const camera = controls.object
    const lifted = liftAboveGround(
      camera.position.y,
      controls.target.y,
      bilinearHeight(displayField, camera.position.x, across(camera.position.z)),
      bilinearHeight(displayField, controls.target.x, across(controls.target.z)),
    )
    camera.position.y = lifted.cameraY
    controls.target.y = lifted.targetY
  }
</script>

<div class="scene">
  <Button variant="outline" size="sm" class="absolute top-3 left-3 z-10 shadow-xs" onclick={() => (locked = !locked)}>
    {locked ? 'Perspective' : 'Fixed view'}
  </Button>
  <Canvas shadows>
    <ReviewInteractivity>
    <T.PerspectiveCamera
      makeDefault
      position={cameraPosition}
      oncreate={(ref) => {
        ref.lookAt(focus.x, plotCenter.y, across(focus.z))
      }}
    >
      <OrbitControls
        enabled={!locked}
        target={orbitTarget}
        onchange={(event) => keepCameraAboveGround(event.target)}
        onstart={() => {
          orbiting = true
          hovered = null
        }}
        onend={() => (orbiting = false)}
      />
    </T.PerspectiveCamera>

    <ReviewSky {sun} centre={{ x: plotCenter.x, y: plotCenter.y, z: across(plotCenter.z) }} />
    <ReviewCutaway depth={cutDepth} shape={cutShape} />
    <ReviewXray on={xray} />
    <T.AmbientLight intensity={0.12} />
    <T.DirectionalLight
      position={lightPosition}
      intensity={sunStrength}
      castShadow
      oncreate={(ref) => {
        configureSunLight(ref)
      }}
    />

    <!-- The model, drawn with z turned over so that it matches the plan rather than mirroring it. -->
    <T.Group scale.z={-1}>
    {#if groundGeometry}
      <T.Mesh geometry={groundGeometry} receiveShadow onclick={clearPick} userData={{ keepWhole: true, ground: true }}>
        <T.MeshStandardMaterial vertexColors roughness={0.95} />
      </T.Mesh>
    {/if}
    {#each roadMeshes as part (part.geometry.uuid)}
      <T.Mesh geometry={part.geometry} receiveShadow userData={{ keepWhole: true }}>
        <T.MeshStandardMaterial color={part.colour} roughness={0.95} side={DoubleSide} />
      </T.Mesh>
    {/each}
    {#each serviceParts as part (part.geometry.uuid)}
      <T.Mesh geometry={part.geometry} userData={{ service: true, keepWhole: true }} renderOrder={5}>
        <T.MeshBasicMaterial color={part.colour} />
      </T.Mesh>
    {/each}
    {#each retainingMeshes as part (part.geometry.uuid)}
      <T.Mesh geometry={part.geometry} castShadow receiveShadow>
        <T.MeshStandardMaterial color={part.colour} roughness={0.95} side={DoubleSide} />
      </T.Mesh>
    {/each}
    {#each carportMeshes as part (part.geometry.uuid)}
      <T.Mesh geometry={part.geometry} castShadow receiveShadow>
        <T.MeshStandardMaterial color={part.colour} roughness={0.8} side={DoubleSide} transparent={part.opacity < 1} opacity={part.opacity} />
      </T.Mesh>
    {/each}
    {#each pavingMeshes as part (part.geometry.uuid)}
      <T.Mesh geometry={part.geometry} receiveShadow onclick={clearPick} userData={{ keepWhole: true }}>
        <T.MeshStandardMaterial color={part.colour} roughness={0.9} side={DoubleSide} />
      </T.Mesh>
    {/each}
    {#if contourMinor}
      <T.LineSegments geometry={contourMinor}>
        <T.LineBasicMaterial color="#3f3428" />
      </T.LineSegments>
    {/if}
    {#if contourMajor}
      <T.LineSegments geometry={contourMajor}>
        <T.LineBasicMaterial color="#1a120c" />
      </T.LineSegments>
    {/if}

    {#each floorCovers.filter((cover) => shown(cover.storey)) as cover (cover.key)}
      <T.Mesh geometry={cover.geometry} position.y={cover.y} receiveShadow>
        <T.MeshStandardMaterial
          map={cover.texture}
          color={cover.texture ? '#ffffff' : cover.colour}
          roughness={0.85}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </T.Mesh>
    {/each}

    {#each floorSlabs.filter((slab) => shown(slab.storey)) as slab (slab.key)}
      <T.Mesh geometry={slab.geometry} position.y={slab.y} receiveShadow>
        <T.MeshStandardMaterial
          color={slab.color}
          roughness={0.95}
          side={DoubleSide}
          polygonOffset={slab.polygonOffset ?? false}
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </T.Mesh>
    {/each}

    {#each trimMeshes.filter((trim) => shownFloor(trim.key)) as trim (trim.key)}
      <T.Group userData={halfCut(trim.datum)}>
      {#each trim.parts as part (part.geometry.uuid)}
        <T.Mesh geometry={part.geometry} receiveShadow>
          <T.MeshStandardMaterial color={part.colour} roughness={0.6} side={DoubleSide} />
        </T.Mesh>
      {/each}
      </T.Group>
    {/each}

    {#each counterMeshes.filter((counter) => shownFloor(counter.key)) as counter (counter.key)}
      <T.Group userData={halfCut(counter.datum)}>
        {#each counter.parts as part (part.geometry.uuid)}
          <T.Mesh geometry={part.geometry} castShadow receiveShadow>
            <T.MeshStandardMaterial color={part.colour} roughness={0.6} />
          </T.Mesh>
        {/each}
      </T.Group>
    {/each}
    {#each fixtureMeshes.filter((fitting) => shownFloor(fitting.key)) as fitting (fitting.key)}
      <T.Group userData={halfCut(fitting.datum)}>
      {#each fitting.parts as part (part.geometry.uuid)}
        <T.Mesh geometry={part.geometry} castShadow receiveShadow {...fixtureHandlers(fitting.key)}>
          <T.MeshStandardMaterial
            color={part.colour}
            roughness={part.roughness}
            metalness={part.metalness}
            emissive={part.emissive ?? '#000000'}
            emissiveIntensity={part.emissiveIntensity ?? 0}
          />
        </T.Mesh>
      {/each}
      </T.Group>
    {/each}

    {#each pillarMeshes.filter((pillar) => shownFloor(pillar.key.split(':')[0])) as pillar (pillar.key)}
      {#each pillar.parts as part (part.geometry.uuid)}
        <T.Mesh geometry={part.geometry} castShadow receiveShadow>
          <T.MeshStandardMaterial color={part.colour} roughness={0.85} />
        </T.Mesh>
      {/each}
    {/each}

    {#each fenceMeshes.filter((fence) => shownFloor(fence.key.split(':')[0])) as fence (fence.key)}
      {#each fence.parts as part (part.geometry.uuid)}
        <T.Mesh geometry={part.geometry} castShadow={part.opacity >= 1} receiveShadow>
          <T.MeshStandardMaterial
            color={part.colour}
            transparent={part.opacity < 1}
            opacity={part.opacity}
            depthWrite={part.opacity >= 1}
            side={DoubleSide}
            roughness={0.8}
          />
        </T.Mesh>
      {/each}
    {/each}

    {#each stairMeshes.filter((stair) => shown(stair.storey)) as stair (stair.key)}
      <T.Mesh geometry={stair.geometry} position.y={stair.y} castShadow receiveShadow>
        <T.MeshStandardMaterial color="#b8b2a7" roughness={0.9} />
      </T.Mesh>
    {/each}

    {#each roofMeshes.filter((roof) => roofs && shownFloor(roof.key)) as roof (roof.key)}
      <T.Mesh geometry={roof.meshes.top ?? undefined} position.y={roof.y} castShadow>
        <T.MeshStandardMaterial
          map={roof.texture}
          color={roof.texture ? '#ffffff' : roof.colour}
          roughness={0.8}
          side={DoubleSide}
        />
      </T.Mesh>
      {#if roof.meshes.under}
        <T.Mesh geometry={roof.meshes.under} position.y={roof.y}>
          <T.MeshStandardMaterial color="#8a7f73" roughness={0.9} side={DoubleSide} />
        </T.Mesh>
      {/if}
      {#if roof.meshes.edges}
        <T.Mesh geometry={roof.meshes.edges} position.y={roof.y} castShadow>
          <T.MeshStandardMaterial color="#e7e5e4" roughness={0.7} side={DoubleSide} />
        </T.Mesh>
      {/if}
      {#each roof.gutters as part (part.geometry.uuid)}
        <T.Mesh geometry={part.geometry} position.y={roof.y} castShadow>
          <T.MeshStandardMaterial color={part.colour} roughness={0.5} metalness={0.2} />
        </T.Mesh>
      {/each}
      {#if roof.panels}
        <T.Mesh geometry={roof.panels} position.y={roof.y} castShadow>
          <T.MeshStandardMaterial color="#1e2a44" metalness={0.4} roughness={0.25} side={DoubleSide} />
        </T.Mesh>
      {/if}
      {#each roof.gables as gable, i (i)}
        {#if gable.body}
          <T.Mesh geometry={gable.body} position.y={roof.y} castShadow receiveShadow>
            <T.MeshStandardMaterial color={gable.colour ?? '#6e6256'} roughness={0.92} />
          </T.Mesh>
        {/if}
        {#if gable.faces}
          <T.Mesh geometry={gable.faces} position.y={roof.y} castShadow receiveShadow>
            <T.MeshStandardMaterial color={gable.colour ?? '#c4b5a0'} roughness={0.92} />
          </T.Mesh>
        {/if}
      {/each}
    {/each}

    {#each walls === 'hidden' ? [] : wallMeshes.filter((wall) => shownFloor(wall.floorId)) as wall (wall.key)}
      <T.Group position.y={wall.datumY} userData={halfCut(wall.datumY)}>
        {#each wall.geoms as geom, i (`${wall.key}-${i}`)}
          <T.Mesh geometry={geom} castShadow receiveShadow {...wallHandlers(wall)}>
            <T.MeshStandardMaterial color="#6e6256" />
          </T.Mesh>
        {/each}
        {#each wall.courses as geom, i (`${wall.key}-course-${i}`)}
          <T.Mesh geometry={geom} castShadow receiveShadow {...wallHandlers(wall)}>
            <T.MeshStandardMaterial color="#c4b5a0" roughness={0.92} />
          </T.Mesh>
        {/each}
        {#each wall.skins as skin (skin.geometry.uuid)}
          <T.Mesh geometry={skin.geometry} castShadow receiveShadow {...wallHandlers(wall)}>
            <T.MeshStandardMaterial color={skin.colour} roughness={0.95} transparent={skin.opacity < 1} opacity={skin.opacity} />
          </T.Mesh>
        {/each}
        {#if wall.lintel}
          <T.Mesh geometry={wall.lintel} castShadow receiveShadow {...wallHandlers(wall)}>
            <T.MeshStandardMaterial color="#8a8680" />
          </T.Mesh>
        {/if}
        {#if wall.frame}
          <T.Mesh geometry={wall.frame} castShadow receiveShadow {...wallHandlers(wall)}>
            <T.MeshStandardMaterial color={FRAME_COLOUR} />
          </T.Mesh>
        {/if}
        {#if wall.glass}
          <T.Mesh geometry={wall.glass}>
            <T.MeshStandardMaterial
              color={GLASS_COLOUR}
              transparent
              opacity={GLASS_OPACITY}
              depthWrite={false}
              side={DoubleSide}
            />
          </T.Mesh>
        {/if}
        {#each wall.panels as panel (`${wall.key}-${panel.geometry.uuid}`)}
          <T.Mesh geometry={panel.geometry} castShadow receiveShadow {...wallHandlers(wall)}>
            <T.MeshStandardMaterial
              color={panel.color}
              emissive={panel.emissive}
              emissiveIntensity={panel.emissive === '#000000' ? 0 : 1}
              toneMapped={panel.emissive === '#000000'}
              roughness={0.72}
            />
          </T.Mesh>
        {/each}
      </T.Group>
    {/each}

    <!-- The wall picked or under the pointer, washed blue: a copy of its faces drawn over it, cut like the wall. -->
    {#each highlightedWalls as item (item.key)}
      <T.Group position.y={item.wall.datumY} userData={halfCut(item.wall.datumY)}>
        {#each [...item.wall.geoms, ...item.wall.courses, ...item.wall.skins.map((skin) => skin.geometry)] as geom, i (`${item.key}-${i}`)}
          <T.Mesh geometry={geom} renderOrder={2}>
            <T.MeshBasicMaterial
              color={item.colour}
              transparent
              opacity={item.opacity}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-2}
              polygonOffsetUnits={-2}
            />
          </T.Mesh>
        {/each}
      </T.Group>
    {/each}

    {#each fixtureBoxes as box (box.key)}
      <T.LineSegments position={box.position} rotation.y={box.turn}>
        <T.EdgesGeometry args={[new BoxGeometry(...box.size)]} />
        <T.LineBasicMaterial color={box.colour} depthTest={false} transparent opacity={0.9} />
      </T.LineSegments>
    {/each}
    </T.Group>
    </ReviewInteractivity>
  </Canvas>
  {#if chosenWall}
    {@const system = systemOf(chosenWall.wall)}
    <ContextPanel
      label="Wall"
      title="Wall"
      description="{wallLength(chosenWall.floor.corners, chosenWall.wall.startCornerId, chosenWall.wall.endCornerId).toFixed(2)} m of {system.name.toLowerCase()}, {chosenWall.wall.openings.length === 0
        ? 'no openings'
        : `${chosenWall.wall.openings.length} ${chosenWall.wall.openings.length === 1 ? 'opening' : 'openings'}`}, on {storeyName(chosenWall.floor.index)}."
      onclose={() => (selected = null)}
    >
      <Button data-look onclick={() => chosenWall && onSelectWall?.(chosenWall.wall.id)}>Open in Focus</Button>
      <p class="text-muted-foreground">Double-click a wall to go straight to it in Focus.</p>
    </ContextPanel>
  {:else if chosenFixture}
    {@const spec = fixtureSpec(chosenFixture.fixture.kind)}
    <ContextPanel label="Fitting" title={spec.name} description={spec.text} onclose={() => (selected = null)}>
      <FittingSetup floorId={chosenFixture.floor.id} fixture={chosenFixture.fixture} />
      <div class="grid gap-2">
        {#if chosenFixture.onWall}
          <Button variant="outline" onclick={() => chosenFixture?.onWall && onSelectWall?.(chosenFixture.onWall.wall.id)}>Open its wall in Focus</Button>
        {/if}
        <Button variant="destructive" onclick={() => chosenFixture && documentStore.removeFixture(chosenFixture.floor.id, chosenFixture.fixture.id)}>Remove</Button>
      </div>
    </ContextPanel>
  {/if}
</div>

<style>
  .scene {
    position: relative;
    width: 100%;
    height: 100%;
  }

</style>
