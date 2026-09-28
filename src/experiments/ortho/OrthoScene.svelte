<script lang="ts">
  import { Canvas, T } from '@threlte/core'
  import { OrbitControls } from '@threlte/extras'
  import type { OrthographicCamera } from 'three'
  import {
    DEFAULT_WINDOW_HEIGHT,
    DEFAULT_WINDOW_WIDTH,
    WALL_HEIGHT,
    WALL_LENGTH,
    WALL_THICKNESS,
  } from './elevation'
  import OrthoResize from './OrthoResize.svelte'

  interface Props {
    orthoMode: boolean
    orthoCamera: OrthographicCamera | undefined
    marker: { u: number; v: number } | null
    onOrthoCamera: (camera: OrthographicCamera) => void
  }

  let { orthoMode, orthoCamera, marker, onOrthoCamera }: Props = $props()

  const wallCenterX = WALL_LENGTH / 2
  const wallCenterY = WALL_HEIGHT / 2
</script>

<Canvas>
  <OrthoResize {orthoMode} {orthoCamera} />

  <T.PerspectiveCamera
    makeDefault={!orthoMode}
    position={[7, 5, 7]}
    oncreate={(ref) => {
      ref.lookAt(wallCenterX, wallCenterY, 0)
    }}
  >
    {#if !orthoMode}
      <OrbitControls target={[wallCenterX, wallCenterY, 0]} />
    {/if}
  </T.PerspectiveCamera>

  <T.OrthographicCamera
    makeDefault={orthoMode}
    manual={orthoMode}
    oncreate={(ref) => {
      onOrthoCamera(ref)
    }}
  />

  <T.AmbientLight intensity={0.45} />
  <T.DirectionalLight position={[5, 8, 8]} intensity={1.1} />

  <T.Mesh position={[wallCenterX, wallCenterY, 0]}>
    <T.BoxGeometry args={[WALL_LENGTH, WALL_HEIGHT, WALL_THICKNESS]} />
    <T.MeshStandardMaterial color="#c4b5a0" />
  </T.Mesh>

  {#if marker}
    <T.Mesh
      position={[
        marker.u,
        marker.v + DEFAULT_WINDOW_HEIGHT / 2,
        WALL_THICKNESS / 2 + 0.002,
      ]}
    >
      <T.PlaneGeometry args={[DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT]} />
      <T.MeshStandardMaterial color="#4a90d9" transparent opacity={0.85} />
    </T.Mesh>
  {/if}
</Canvas>
