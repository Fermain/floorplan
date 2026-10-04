<script lang="ts">
  import { Canvas, T } from '@threlte/core'
  import { OrbitControls } from '@threlte/extras'
  import type { BufferGeometry, OrthographicCamera } from 'three'
  import { DoubleSide } from 'three'
  import {
    FRAME_COLOUR,
    GLASS_COLOUR,
    GLASS_OPACITY,
    type OpeningPanelMesh,
  } from '../../lib/geometry/frames'
  import ElevationResize from './ElevationResize.svelte'
  import type { FencePart } from '../../lib/geometry/fence'
  import type { WallElevationFrame } from './wallFrame'
  import { wallCenterWorld } from './wallFrame'

  interface Props {
    locked: boolean
    frame: WallElevationFrame
    wallGeometries: BufferGeometry[]
    courseGeometries: BufferGeometry[]
    lintelGeometry: BufferGeometry | null
    frameGeometry: BufferGeometry | null
    glassGeometry: BufferGeometry | null
    panelMeshes: OpeningPanelMesh[]
    fenceParts?: FencePart[]
    orthoCamera: OrthographicCamera | undefined
    onOrthoCamera: (camera: OrthographicCamera) => void
  }

  let {
    locked,
    frame,
    wallGeometries,
    courseGeometries,
    lintelGeometry,
    frameGeometry,
    glassGeometry,
    panelMeshes,
    fenceParts = [],
    orthoCamera,
    onOrthoCamera,
  }: Props = $props()

  const center = $derived(wallCenterWorld(frame))
  const orbitTarget = $derived<[number, number, number]>([
    center.x,
    center.y,
    center.z,
  ])

  // Light the face in view from the front and a little above, whichever way it faces.
  const lightFrom = $derived.by((): [number, number, number] => {
    const from = frame.axisZ.clone().multiplyScalar(8).addScaledVector(frame.axisY, 6).addScaledVector(frame.axisX, 2)
    return [from.x, from.y, from.z]
  })

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
    <OrbitControls enabled={!locked} target={orbitTarget} />
  </T.PerspectiveCamera>

  <T.OrthographicCamera
    makeDefault={locked}
    manual={locked}
    oncreate={(ref) => {
      onOrthoCamera(ref)
    }}
  />

  <T.AmbientLight intensity={0.45} />
  <T.DirectionalLight position={lightFrom} intensity={1.1} />

  <!-- The wall, drawn with z turned over so that the view is not a mirror image of the plan. The frame the
       cameras and light use is already given in that world. -->
  <T.Group scale.z={-1}>
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
    {#if frameGeometry}
      <T.Mesh geometry={frameGeometry}>
        <T.MeshStandardMaterial color={FRAME_COLOUR} />
      </T.Mesh>
    {/if}
    {#if glassGeometry}
      <T.Mesh geometry={glassGeometry}>
        <T.MeshStandardMaterial
          color={GLASS_COLOUR}
          transparent
          opacity={GLASS_OPACITY}
          depthWrite={false}
          side={DoubleSide}
        />
      </T.Mesh>
    {/if}
    {#each fenceParts as part (part.geometry.uuid)}
      <T.Mesh geometry={part.geometry}>
        <T.MeshStandardMaterial
          color={part.colour}
          transparent={part.opacity < 1}
          opacity={part.opacity}
          depthWrite={part.opacity >= 1}
          side={DoubleSide}
          roughness={part.roughness ?? 0.8}
          metalness={part.metalness ?? 0}
          emissive={part.emissive ?? '#000000'}
          emissiveIntensity={part.emissiveIntensity ?? 0}
        />
      </T.Mesh>
    {/each}
    {#each panelMeshes as panel (panel.geometry.uuid)}
      <T.Mesh geometry={panel.geometry}>
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
</Canvas>
