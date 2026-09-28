<script lang="ts">
  import { Canvas, T } from '@threlte/core'
  import { OrbitControls } from '@threlte/extras'
  import type { BufferGeometry } from 'three'
  import { buildGroundGeometry, bottomSamplesAlong } from '../../lib/geometry/terrain'
  import { buildWallGeometries } from '../../lib/geometry/walls'
  import { documentStore } from '../../lib/state/document.svelte'
  import { sunDirection } from '../../lib/solar/sun'
  import type { Floor, Wall } from '../../lib/model/types'

  interface Props {
    sunDate: Date
  }

  let { sunDate }: Props = $props()

  type FloorMeshes = { id: string; datumY: number; geoms: BufferGeometry[] }

  let groundGeometry = $state<BufferGeometry | null>(null)
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
    if (floor.index !== 0) {
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
    const ground = buildGroundGeometry(heightfield)
    const built: FloorMeshes[] = floors.map((floor) => {
      const geoms: BufferGeometry[] = []
      for (const wall of floor.walls) {
        if (wall.skin === 'logical') {
          continue
        }
        const samples = bottomSamplesForWall(floor, wall)
        geoms.push(...buildWallGeometries(floor, wall, samples))
      }
      return { id: floor.id, datumY: floor.index === 0 ? 0 : floor.datumHeight, geoms }
    })
    groundGeometry = ground
    floorMeshes = built
    return () => {
      ground.dispose()
      for (const f of built) {
        for (const g of f.geoms) {
          g.dispose()
        }
      }
    }
  })

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
</script>

<Canvas shadows>
  <T.PerspectiveCamera
    makeDefault
    position={[plotCenter.x + 14, plotCenter.y + 10, plotCenter.z + 14]}
    oncreate={(ref) => {
      ref.lookAt(plotCenter.x, plotCenter.y, plotCenter.z)
    }}
  >
    <OrbitControls target={[plotCenter.x, plotCenter.y, plotCenter.z]} />
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
