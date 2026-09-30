<script lang="ts">
  import { Canvas, T } from '@threlte/core'
  import { OrbitControls } from '@threlte/extras'
  import {
    BufferGeometry,
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
    levelField,
    pointInRing,
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
  import { buildRoofGeometry, masonryReach, WALL_HEAD_M } from '../../lib/geometry/roof'
  import { FLOOR_TO_FLOOR } from '../../lib/plot/fixture'
  import { bilinearHeight, buildGroundGeometry, bottomSamplesAlong } from '../../lib/geometry/terrain'
  import { documentStore } from '../../lib/state/document.svelte'
  import { sunDirection } from '../../lib/solar/sun'
  import type { Floor, Wall } from '../../lib/model/types'
  import type { OrbitControls as OrbitControlsInstance } from 'three/examples/jsm/controls/OrbitControls.js'
  import type { Ring } from '../../lib/geometry/pad'
  import { liftAboveGround } from './ground-limit'
  import ReviewInteractivity from './ReviewInteractivity.svelte'

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
  type RoofMesh = { key: string; geometry: BufferGeometry; y: number }

  const DECK_THICKNESS = deckThickness()

  let locked = $state(false)
  let groundGeometry = $state<BufferGeometry | null>(null)
  let contourMinor = $state<BufferGeometry | null>(null)
  let contourMajor = $state<BufferGeometry | null>(null)
  let wallMeshes = $state<WallMeshes[]>([])
  let floorSlabs = $state<FloorSlab[]>([])
  let roofMeshes = $state<RoofMesh[]>([])
  const doc = $derived(documentStore.document)

  const plotCenter = $derived.by(() => {
    const ring = doc.plot.ring
    let sx = 0
    let sz = 0
    for (const [x, z] of ring) {
      sx += x
    }
    const n = ring.length || 1
    return { x: sx / n, y: 2, z: sz / n }
  })

  let stableTarget: [number, number, number] = [0, 2, 0]
  let stableCamera: [number, number, number] = [14, 12, 14]

  function sameTriple(a: [number, number, number], b: [number, number, number]) {
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
  }

  const orbitTarget = $derived.by(() => {
    const next: [number, number, number] = [plotCenter.x, plotCenter.y, plotCenter.z]
    if (sameTriple(stableTarget, next)) return stableTarget
    stableTarget = next
    return stableTarget
  })

  const cameraPosition = $derived.by(() => {
    const next: [number, number, number] = [plotCenter.x + 14, plotCenter.y + 10, plotCenter.z + 14]
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

  const lightPosition = $derived([
    plotCenter.x + sun.x * 40,
    plotCenter.y + sun.y * 40,
    plotCenter.z + sun.z * 40,
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
    const heightfield = doc.heightfield
    const floors = doc.building.floors
    const pad = groundPad(doc)
    const displayField = pad ? levelField(heightfield, pad.structures) : heightfield
    const ground = buildGroundGeometry(displayField)
    const contours = buildContourLines(displayField, CONTOUR_LIFT_M)
    const minor = lineGeometry(contours.minor)
    const major = lineGeometry(contours.major)
    const built: WallMeshes[] = []
    for (const floor of floors) {
      for (const wall of floor.walls) {
        if (wall.skin === 'logical') continue
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
    groundGeometry = ground
    contourMinor = minor
    contourMajor = major
    wallMeshes = built
    floorSlabs = slabs
    roofMeshes = roofs
    return () => {
      ground.dispose()
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
      for (const roof of roofs) roof.geometry.dispose()
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

  function roofsFor(pad: ReturnType<typeof groundPad>): RoofMesh[] {
    const meshes: RoofMesh[] = []
    for (const floor of doc.building.floors) {
      const roof = floor.roof
      if (!roof || floor.index === 0) continue
      const below = doc.building.floors.find(
        (item) => item.unitId === floor.unitId && item.index === floor.index - 1,
      )
      const geometry = buildRoofGeometry(floor, roof, masonryReach(below?.walls ?? []))
      if (!geometry) continue
      const grade = below ? supportGrade(below, pad) : outlineGrade(floor, pad)
      const supportDatum = below?.datumHeight ?? floor.datumHeight - FLOOR_TO_FLOOR
      meshes.push({
        key: floor.id,
        geometry,
        y: floorWorldDatum(supportDatum, grade) + WALL_HEAD_M,
      })
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
      const polygons = deckPolygons(floor)
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
    light.shadow.camera.far = 120
    const extent = 24
    light.shadow.camera.left = -extent
    light.shadow.camera.right = extent
    light.shadow.camera.top = extent
    light.shadow.camera.bottom = -extent
    light.shadow.camera.updateProjectionMatrix()
  }

  function keepCameraAboveGround(controls: OrbitControlsInstance) {
    const field = doc.heightfield
    const pad = groundPad(doc)
    const displayField = pad ? levelField(field, pad.structures) : field
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
  <button type="button" class="lock" onclick={() => (locked = !locked)}>
    {locked ? 'Perspective' : 'Fixed view'}
  </button>
  <Canvas shadows>
    <ReviewInteractivity />
    <T.PerspectiveCamera
      makeDefault
      position={cameraPosition}
      oncreate={(ref) => {
        ref.lookAt(plotCenter.x, plotCenter.y, plotCenter.z)
      }}
    >
      <OrbitControls
        enabled={!locked}
        target={orbitTarget}
        onchange={(event) => keepCameraAboveGround(event.target)}
      />
    </T.PerspectiveCamera>

    <T.AmbientLight intensity={0.35} />
    <T.DirectionalLight
      position={lightPosition}
      intensity={1.15}
      castShadow
      oncreate={(ref) => {
        configureSunLight(ref)
      }}
    />

    {#if groundGeometry}
      <T.Mesh geometry={groundGeometry} receiveShadow>
        <T.MeshStandardMaterial color="#6b8f71" />
      </T.Mesh>
    {/if}
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

    {#each roofMeshes as roof (roof.key)}
      <T.Mesh geometry={roof.geometry} position.y={roof.y} castShadow>
        <T.MeshStandardMaterial color="#5e666e" roughness={0.84} side={DoubleSide} />
      </T.Mesh>
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

  .lock {
    position: absolute;
    top: 0.75rem;
    left: 0.75rem;
    z-index: 1;
    padding: 0.35rem 0.75rem;
    border: 1px solid #d4d4d8;
    border-radius: 4px;
    background: #fff;
    font: 0.875rem system-ui, sans-serif;
    cursor: pointer;
  }
</style>
