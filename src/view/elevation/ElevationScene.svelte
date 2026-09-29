<script lang="ts">
  import { Canvas, T } from '@threlte/core'
  import { OrbitControls } from '@threlte/extras'
  import type { BufferGeometry, OrthographicCamera } from 'three'
  import ElevationResize from './ElevationResize.svelte'
  import type { WallElevationFrame } from './wallFrame'
  import { wallCenterWorld } from './wallFrame'

  interface Props {
    locked: boolean
    frame: WallElevationFrame
    wallGeometries: BufferGeometry[]
    courseGeometries: BufferGeometry[]
    lintelGeometry: BufferGeometry | null
    orthoCamera: OrthographicCamera | undefined
    onOrthoCamera: (camera: OrthographicCamera) => void
  }

  let { locked, frame, wallGeometries, courseGeometries, lintelGeometry, orthoCamera, onOrthoCamera }: Props =
    $props()

  const center = $derived(wallCenterWorld(frame))
  const orbitTarget = $derived<[number, number, number]>([
    center.x,
    center.y,
    center.z,
  ])

  const perspPosTuple = $derived.by((): [number, number, number] => {
    const c = wallCenterWorld(frame)
    const span = Math.max(frame.length, frame.height)
    const pos = c
      .clone()
      .addScaledVector(frame.axisZ, span * 1.1)
      .addScaledVector(frame.axisY, span * 0.45)
      .addScaledVector(frame.axisX, span * 0.35)
    return [pos.x, pos.y, pos.z]
  })
</script>

<Canvas>
  <ElevationResize {locked} {orthoCamera} {frame} />

  <T.PerspectiveCamera
    makeDefault={!locked}
    position={perspPosTuple}
    oncreate={(ref) => {
      const c = wallCenterWorld(frame)
      ref.lookAt(c.x, c.y, c.z)
    }}
  >
    {#if !locked}
      <OrbitControls target={orbitTarget} />
    {/if}
  </T.PerspectiveCamera>

  <T.OrthographicCamera
    makeDefault={locked}
    manual={locked}
    oncreate={(ref) => {
      onOrthoCamera(ref)
    }}
  />

  <T.AmbientLight intensity={0.45} />
  <T.DirectionalLight position={[5, 8, 8]} intensity={1.1} />

  {#each wallGeometries as geometry (geometry.uuid)}
    <T.Mesh {geometry}>
      <T.MeshStandardMaterial color="#6e6256" />
    </T.Mesh>
  {/each}
  {#each courseGeometries as geometry (geometry.uuid)}
    <T.Mesh {geometry}>
      <T.MeshStandardMaterial color="#c4b5a0" roughness={0.92} />
    </T.Mesh>
  {/each}
  {#if lintelGeometry}
    <T.Mesh geometry={lintelGeometry}>
      <T.MeshStandardMaterial color="#8a8680" />
    </T.Mesh>
  {/if}
</Canvas>
