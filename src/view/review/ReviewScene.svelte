<script lang="ts">
  import { Canvas, T } from '@threlte/core'
  import { OrbitControls } from '@threlte/extras'
  import {
    BufferGeometry,
    Color,
    DoubleSide,
    ExtrudeGeometry,
    Float32BufferAttribute,
    Path,
    Shape,
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
  import { buildCourseFaceGeometries, buildLintelGeometry, buildWallGeometries } from '../../lib/geometry/walls'
  import { buildRoofMeshes, masonryReach, roofInfills, WALL_HEAD_M, type RoofMeshes } from '../../lib/geometry/roof'
  import { coveringOf } from '../../lib/geometry/coverings'
  import { coveringTexture } from './roofTexture'
  import type { CanvasTexture } from 'three'
  import { buildGableGeometries } from '../../lib/geometry/gable'
  import { stairVoids } from '../../lib/geometry/stairs'
  import { supportingFloor } from '../../lib/model/stories'
  import { buildStairGeometry } from '../../lib/geometry/stairMesh'
  import { buildFenceParts, fenceFrame, type FencePart } from '../../lib/geometry/fence'
  import { buildPillarParts, type PillarPart } from '../../lib/geometry/pillars'
  import { buildRoadParts, type RoadPart } from '../../lib/geometry/roads'
  import { buildFixtureParts, fixtureStandAboveDatum, siteField, type FixturePart } from '../../lib/geometry/fixtures'
  import { buildTrimParts, trimRuns, type TrimPart } from '../../lib/geometry/trims'
  import { powerLayout, type PanelSpot } from '../../lib/geometry/power'
  import { buildGutterParts, gutterLayout, gutterOf, type GutterPart } from '../../lib/geometry/gutters'
  import { floorSupports, type SupportPoint } from '../../lib/model/supports'
  import { wallSystem } from '../../lib/model/systems'
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
  import { Button } from '$lib/components/ui/button'

  interface Props {
    sunDate: Date
    onSelectWall?: (wallId: string) => void
  }

  let { sunDate, onSelectWall }: Props = $props()

  type WallMeshes = {
    key: string
    wallId: string
    datumY: number
    geoms: BufferGeometry[]
    courses: BufferGeometry[]
    lintel: BufferGeometry | null
    frame: BufferGeometry | null
    glass: BufferGeometry | null
    panels: OpeningPanelMesh[]
  }
  type FloorSlab = { key: string; geometry: BufferGeometry; y: number; color: string; polygonOffset?: boolean }
  type RoofMesh = {
    key: string
    meshes: RoofMeshes
    texture: CanvasTexture | null
    colour: string
    gable: { body: BufferGeometry | null; faces: BufferGeometry | null }
    panels: BufferGeometry | null
    gutters: GutterPart[]
    y: number
  }
  type StairMesh = { key: string; geometry: BufferGeometry; y: number }

  const DECK_THICKNESS = deckThickness()

  let locked = $state(false)
  let groundGeometry = $state<BufferGeometry | null>(null)
  let roadMeshes = $state<RoadPart[]>([])
  // How far the ground carries on past the survey.
  const SURROUNDINGS_M = 120
  const LAWN = '#6a8f5c'
  const VELD = '#8f9468'
  let contourMinor = $state<BufferGeometry | null>(null)
  let contourMajor = $state<BufferGeometry | null>(null)
  let wallMeshes = $state<WallMeshes[]>([])
  let floorSlabs = $state<FloorSlab[]>([])
  let roofMeshes = $state<RoofMesh[]>([])
  let stairMeshes = $state<StairMesh[]>([])
  let fenceMeshes = $state<{ key: string; parts: FencePart[] }[]>([])
  let pillarMeshes = $state<{ key: string; parts: PillarPart[] }[]>([])
  let fixtureMeshes = $state<{ key: string; parts: FixturePart[] }[]>([])
  let trimMeshes = $state<{ key: string; parts: TrimPart[] }[]>([])
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

  let stableTarget: [number, number, number] = [0, 2, 0]
  let stableCamera: [number, number, number] = [14, 12, 14]

  function sameTriple(a: [number, number, number], b: [number, number, number]) {
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
  }

  // The camera looks at the building, from far enough back to take it all in; on an empty plot, at the plot.
  const focus = $derived.by(() => {
    const corners = doc.building.floors.flatMap((floor) => floor.corners)
    if (corners.length === 0) return { x: plotCenter.x, z: plotCenter.z, reach: 14 }
    const xs = corners.map((corner) => corner.x)
    const zs = corners.map((corner) => corner.z)
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs))
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2, reach: Math.max(14, size * 1.1) }
  })

  const orbitTarget = $derived.by(() => {
    const next: [number, number, number] = [focus.x, plotCenter.y, focus.z]
    if (sameTriple(stableTarget, next)) return stableTarget
    stableTarget = next
    return stableTarget
  })

  const cameraPosition = $derived.by(() => {
    const next: [number, number, number] = [focus.x + focus.reach, plotCenter.y + focus.reach * 0.7, focus.z + focus.reach]
    if (sameTriple(stableCamera, next)) return stableCamera
    stableCamera = next
    return stableCamera
  })

  const sun = $derived(
    sunDirection(
      sunDate,
      doc.plot.latitude,
      doc.plot.longitude,
      doc.plot.northBearingDeg,
    ),
  )

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
    plotCenter.z + sun.z * (20 + shadowReach),
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

  function onWallClick(wallId: string) {
    if (!locked) return
    onSelectWall?.(wallId)
  }

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
    const ground = buildGroundGeometry(surroundings, (x, z) => {
      const out = pointInRing(ring, x, z) ? 0 : Math.min(1, ringDistance(ring, x, z) / 4)
      tint.copy(lawn).lerp(veld, out)
      return [tint.r, tint.g, tint.b]
    })
    const contours = buildContourLines(displayField, CONTOUR_LIFT_M)
    const roadParts = buildRoadParts(doc.plot, (x, z) => bilinearHeight(surroundings, x, z))
    const minor = lineGeometry(contours.minor)
    const major = lineGeometry(contours.major)
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
        if (geoms.length === 0 && courses.length === 0 && !lintel && !frame && !glass && panels.length === 0) continue
        built.push({
          key: `${floor.id}:${wall.id}`,
          wallId: wall.id,
          datumY: floorWorldDatum(floor.datumHeight, wallDatum(floor, wall, pad) ?? 0),
          geoms,
          courses,
          lintel,
          frame,
          glass,
          panels,
        })
      }
    }
    const slabs = pad ? [...slabsFor(pad.structures), ...decksFor(floors, pad)] : []
    const roofs = roofsFor(pad)
    const stairs = stairsFor(pad)
    const trims = floors.map((floor) => ({
      key: floor.id,
      parts: buildTrimParts(trimRuns(doc, floor), floor, floorWorldDatum(floor.datumHeight, supportGrade(floor, pad))),
    }))
    const fittings = floors
      .filter((floor) => (floor.fixtures ?? []).length > 0)
      .map((floor) => {
        const datum = floorWorldDatum(floor.datumHeight, supportGrade(floor, pad))
        return {
          key: floor.id,
          parts: buildFixtureParts(floor.fixtures ?? [], (fixture) => datum + fixtureStandAboveDatum(doc, floor, fixture)),
        }
      })
    groundGeometry = ground
    roadMeshes = roadParts
    contourMinor = minor
    contourMajor = major
    wallMeshes = built
    floorSlabs = slabs
    roofMeshes = roofs
    stairMeshes = stairs
    fenceMeshes = fences
    pillarMeshes = pillars
    fixtureMeshes = fittings
    trimMeshes = trims
    return () => {
      for (const trim of trims) for (const part of trim.parts) part.geometry.dispose()
      for (const fitting of fittings) for (const part of fitting.parts) part.geometry.dispose()
      for (const pillar of pillars) for (const part of pillar.parts) part.geometry.dispose()
      for (const fence of fences) for (const part of fence.parts) part.geometry.dispose()
      ground.dispose()
      for (const part of roadParts) part.geometry.dispose()
      minor?.dispose()
      major?.dispose()
      for (const wall of built) {
        for (const g of wall.geoms) g.dispose()
        for (const g of wall.courses) g.dispose()
        wall.lintel?.dispose()
        wall.frame?.dispose()
        wall.glass?.dispose()
        for (const panel of wall.panels) panel.geometry.dispose()
      }
      for (const slab of slabs) slab.geometry.dispose()
      for (const roof of roofs) {
        roof.meshes.top?.dispose()
        roof.meshes.under?.dispose()
        roof.meshes.edges?.dispose()
        roof.gable.body?.dispose()
        roof.panels?.dispose()
        for (const part of roof.gutters) part.geometry.dispose()
        roof.gable.faces?.dispose()
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
      const gable = below
        ? buildGableGeometries(below, roofInfills(below, floor, roof, reach))
        : { body: null, faces: null }
      const grade = below ? supportGrade(below, pad) : outlineGrade(floor, pad)
      const supportDatum = below?.datumHeight ?? floor.datumHeight - FLOOR_TO_FLOOR
      meshes.push({
        key: floor.id,
        meshes: built,
        texture: coveringTexture(spec),
        colour: spec.colour,
        gable,
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
          geometry,
          y: structure.datum + SURFACE_BED_TOP_ABOVE_DATUM_M - SURFACE_BED_THICKNESS_M,
          color: '#a3a3a3',
        })
      })
    })
    return slabs
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
    light.target.position.set(plotCenter.x, plotCenter.y, plotCenter.z)
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
      bilinearHeight(displayField, camera.position.x, camera.position.z),
      bilinearHeight(displayField, controls.target.x, controls.target.z),
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
    <ReviewInteractivity />
    <T.PerspectiveCamera
      makeDefault
      position={cameraPosition}
      oncreate={(ref) => {
        ref.lookAt(focus.x, plotCenter.y, focus.z)
      }}
    >
      <OrbitControls
        enabled={!locked}
        target={orbitTarget}
        onchange={(event) => keepCameraAboveGround(event.target)}
      />
    </T.PerspectiveCamera>

    <ReviewSky {sun} centre={plotCenter} />
    <T.AmbientLight intensity={0.12} />
    <T.DirectionalLight
      position={lightPosition}
      intensity={sunStrength}
      castShadow
      oncreate={(ref) => {
        configureSunLight(ref)
      }}
    />

    {#if groundGeometry}
      <T.Mesh geometry={groundGeometry} receiveShadow>
        <T.MeshStandardMaterial vertexColors roughness={0.95} />
      </T.Mesh>
    {/if}
    {#each roadMeshes as part (part.geometry.uuid)}
      <T.Mesh geometry={part.geometry} receiveShadow>
        <T.MeshStandardMaterial color={part.colour} roughness={0.95} side={DoubleSide} />
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

    {#each floorSlabs as slab (slab.key)}
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

    {#each trimMeshes as trim (trim.key)}
      {#each trim.parts as part (part.geometry.uuid)}
        <T.Mesh geometry={part.geometry} receiveShadow>
          <T.MeshStandardMaterial color={part.colour} roughness={0.6} side={DoubleSide} />
        </T.Mesh>
      {/each}
    {/each}

    {#each fixtureMeshes as fitting (fitting.key)}
      {#each fitting.parts as part (part.geometry.uuid)}
        <T.Mesh geometry={part.geometry} castShadow receiveShadow>
          <T.MeshStandardMaterial
            color={part.colour}
            roughness={part.roughness}
            metalness={part.metalness}
            emissive={part.emissive ?? '#000000'}
            emissiveIntensity={part.emissiveIntensity ?? 0}
          />
        </T.Mesh>
      {/each}
    {/each}

    {#each pillarMeshes as pillar (pillar.key)}
      {#each pillar.parts as part (part.geometry.uuid)}
        <T.Mesh geometry={part.geometry} castShadow receiveShadow>
          <T.MeshStandardMaterial color={part.colour} roughness={0.85} />
        </T.Mesh>
      {/each}
    {/each}

    {#each fenceMeshes as fence (fence.key)}
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

    {#each stairMeshes as stair (stair.key)}
      <T.Mesh geometry={stair.geometry} position.y={stair.y} castShadow receiveShadow>
        <T.MeshStandardMaterial color="#b8b2a7" roughness={0.9} />
      </T.Mesh>
    {/each}

    {#each roofMeshes as roof (roof.key)}
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
      {#if roof.gable.body}
        <T.Mesh geometry={roof.gable.body} position.y={roof.y} castShadow receiveShadow>
          <T.MeshStandardMaterial color="#6e6256" />
        </T.Mesh>
      {/if}
      {#if roof.gable.faces}
        <T.Mesh geometry={roof.gable.faces} position.y={roof.y} castShadow receiveShadow>
          <T.MeshStandardMaterial color="#c4b5a0" roughness={0.92} />
        </T.Mesh>
      {/if}
    {/each}

    {#each wallMeshes as wall (wall.key)}
      <T.Group position.y={wall.datumY}>
        {#each wall.geoms as geom, i (`${wall.key}-${i}`)}
          <T.Mesh
            geometry={geom}
            castShadow
            receiveShadow
            onclick={() => onWallClick(wall.wallId)}
          >
            <T.MeshStandardMaterial color="#6e6256" />
          </T.Mesh>
        {/each}
        {#each wall.courses as geom, i (`${wall.key}-course-${i}`)}
          <T.Mesh geometry={geom} castShadow receiveShadow>
            <T.MeshStandardMaterial color="#c4b5a0" roughness={0.92} />
          </T.Mesh>
        {/each}
        {#if wall.lintel}
          <T.Mesh geometry={wall.lintel} castShadow receiveShadow>
            <T.MeshStandardMaterial color="#8a8680" />
          </T.Mesh>
        {/if}
        {#if wall.frame}
          <T.Mesh geometry={wall.frame} castShadow receiveShadow>
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
          <T.Mesh geometry={panel.geometry} castShadow receiveShadow>
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
  </Canvas>
</div>

<style>
  .scene {
    position: relative;
    width: 100%;
    height: 100%;
  }

</style>
