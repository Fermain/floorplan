<script lang="ts">
  import { Canvas, T } from '@threlte/core'
  import { OrbitControls } from '@threlte/extras'
  import { BufferGeometry, Float32BufferAttribute } from 'three'
  import { buildContourLines, CONTOUR_LIFT_M } from '../../lib/geometry/contours'
  import { floorWorldDatum, groundPad, levelField } from '../../lib/geometry/pad'
  import { bilinearHeight, buildGroundGeometry, bottomSamplesAlong } from '../../lib/geometry/terrain'
  import { buildWallGeometries } from '../../lib/geometry/walls'
  import { documentStore } from '../../lib/state/document.svelte'
  import { sunDirection } from '../../lib/solar/sun'
  import type { Floor, Wall } from '../../lib/model/types'
  import type { OrbitControls as OrbitControlsInstance } from 'three/examples/jsm/controls/OrbitControls.js'
  import { liftAboveGround } from './ground-limit'

  interface Props {
    sunDate: Date
  }

  let { sunDate }: Props = $props()

  type FloorMeshes = { id: string; datumY: number; geoms: BufferGeometry[] }

  let groundGeometry = $state<BufferGeometry | null>(null)
  let contourMinor = $state<BufferGeometry | null>(null)
  let contourMajor = $state<BufferGeometry | null>(null)
  let floorMeshes = $state<FloorMeshes[]>([])

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
    if (floor.index !== 0 || groundPad(doc)) {
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
    const displayField = pad ? levelField(heightfield, pad.rings, pad.datum) : heightfield
    const ground = buildGroundGeometry(displayField)
    const contours = buildContourLines(displayField, CONTOUR_LIFT_M)
    const minor = lineGeometry(contours.minor)
    const major = lineGeometry(contours.major)
    const built: FloorMeshes[] = floors.map((floor) => {
      const geoms: BufferGeometry[] = []
      for (const wall of floor.walls) {
        if (wall.skin === 'logical') {
          continue
        }
        const samples = bottomSamplesForWall(floor, wall)
        geoms.push(...buildWallGeometries(floor, wall, samples))
      }
      return { id: floor.id, datumY: floorWorldDatum(floor.datumHeight, pad), geoms }
    })
    groundGeometry = ground
    contourMinor = minor
    contourMajor = major
    floorMeshes = built
    return () => {
      ground.dispose()
      minor?.dispose()
      major?.dispose()
      for (const f of built) {
        for (const g of f.geoms) {
          g.dispose()
        }
      }
    }
  })

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
    const displayField = pad ? levelField(field, pad.rings, pad.datum) : field
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

  {#each floorMeshes as floor (floor.id)}
    <T.Group position.y={floor.datumY}>
      {#each floor.geoms as geom, i (`${floor.datumY}-${i}`)}
        <T.Mesh geometry={geom} castShadow receiveShadow>
          <T.MeshStandardMaterial color="#c4b5a0" />
        </T.Mesh>
      {/each}
    </T.Group>
  {/each}
</Canvas>
