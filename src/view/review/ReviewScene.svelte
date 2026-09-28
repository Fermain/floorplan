<script lang="ts">
  import { Canvas, T } from '@threlte/core'
  import { OrbitControls } from '@threlte/extras'
  import { BufferGeometry, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, Path, Shape, ShapeGeometry } from 'three'
  import { buildContourLines, CONTOUR_LIFT_M } from '../../lib/geometry/contours'
  import { deckPolygons, type DeckPolygon } from '../../lib/geometry/deck'
  import { floorWorldDatum, groundPad, levelField, pointInRing, wallDatum } from '../../lib/geometry/pad'
  import { buildLintelGeometry, buildWallGeometries } from '../../lib/geometry/walls'
  import { bilinearHeight, buildGroundGeometry, bottomSamplesAlong } from '../../lib/geometry/terrain'
  import { BLOCK_HEIGHT, DEFAULT_STOREY_HEIGHT, FLOOR_TO_FLOOR } from '../../lib/plot/fixture'
  import { documentStore } from '../../lib/state/document.svelte'
  import { sunDirection } from '../../lib/solar/sun'
  import type { Floor, Wall } from '../../lib/model/types'
  import type { OrbitControls as OrbitControlsInstance } from 'three/examples/jsm/controls/OrbitControls.js'
  import type { Ring } from '../../lib/geometry/pad'
  import { liftAboveGround } from './ground-limit'

  interface Props {
    sunDate: Date
  }

  let { sunDate }: Props = $props()

  type WallMeshes = {
    key: string
    wallId: string
    datumY: number
    geoms: BufferGeometry[]
    lintel: BufferGeometry | null
  }
  type FloorSlab = { key: string; geometry: BufferGeometry; y: number; color: string; polygonOffset?: boolean }

  const WALL_HEAD = Math.floor(DEFAULT_STOREY_HEIGHT / BLOCK_HEIGHT) * BLOCK_HEIGHT
  const DECK_THICKNESS = FLOOR_TO_FLOOR - WALL_HEAD

  let groundGeometry = $state<BufferGeometry | null>(null)
  let contourMinor = $state<BufferGeometry | null>(null)
  let contourMajor = $state<BufferGeometry | null>(null)
  let wallMeshes = $state<WallMeshes[]>([])
  let floorSlabs = $state<FloorSlab[]>([])

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
        const geoms = buildWallGeometries(floor, wall, samples)
        const lintel = buildLintelGeometry(floor, wall)
        if (geoms.length === 0 && !lintel) continue
        built.push({
          key: `${floor.id}:${wall.id}`,
          wallId: wall.id,
          datumY: floorWorldDatum(floor.datumHeight, wallDatum(floor, wall, pad) ?? 0),
          geoms,
          lintel,
        })
      }
    }
    const slabs = pad ? [...slabsFor(pad.structures), ...decksFor(floors, pad)] : []
    groundGeometry = ground
    contourMinor = minor
    contourMajor = major
    wallMeshes = built
    floorSlabs = slabs
    return () => {
      ground.dispose()
      minor?.dispose()
      major?.dispose()
      for (const wall of built) {
        for (const g of wall.geoms) g.dispose()
        wall.lintel?.dispose()
      }
      for (const slab of slabs) slab.geometry.dispose()
    }
  })

  function slabsFor(structures: { datum: number; rings: Ring[] }[]): FloorSlab[] {
    const slabs: FloorSlab[] = []
    structures.forEach((structure, structureIndex) => {
      structure.rings.forEach((ring, ringIndex) => {
        if (ring.length < 3) return
        const shape = new Shape()
        shape.moveTo(ring[0].x, -ring[0].z)
        for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i].x, -ring[i].z)
        shape.closePath()
        const geometry = new ShapeGeometry(shape)
        geometry.rotateX(-Math.PI / 2)
        slabs.push({
          key: `${structureIndex}-${ringIndex}`,
          geometry,
          y: structure.datum + 0.02,
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
      if (floor.index === 0) continue
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

<Canvas shadows>
  <T.PerspectiveCamera
    makeDefault
    position={[plotCenter.x + 14, plotCenter.y + 10, plotCenter.z + 14]}
    oncreate={(ref) => {
      ref.lookAt(plotCenter.x, plotCenter.y, plotCenter.z)
    }}
  >
    <OrbitControls
      target={[plotCenter.x, plotCenter.y, plotCenter.z]}
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

  {#each wallMeshes as wall (wall.key)}
    <T.Group position.y={wall.datumY}>
      {#each wall.geoms as geom, i (`${wall.key}-${i}`)}
        <T.Mesh geometry={geom} castShadow receiveShadow>
          <T.MeshStandardMaterial color="#c4b5a0" />
        </T.Mesh>
      {/each}
      {#if wall.lintel}
        <T.Mesh geometry={wall.lintel} castShadow receiveShadow>
          <T.MeshStandardMaterial color="#8a8680" />
        </T.Mesh>
      {/if}
    </T.Group>
  {/each}
</Canvas>
