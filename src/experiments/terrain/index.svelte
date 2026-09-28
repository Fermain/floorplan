<script lang="ts">
  import { Canvas, T } from '@threlte/core'
  import { OrbitControls } from '@threlte/extras'
  import { DoubleSide } from 'three'
  import { buildDoubleSkinWall, buildGroundGeometry } from './mesh'

  const groundGeometry = buildGroundGeometry()
  const wall = buildDoubleSkinWall(0, 2, 16, 14)
</script>

<div class="viewport">
  <Canvas>
    <T.PerspectiveCamera
      makeDefault
      position={[12, 7, 4]}
      oncreate={(ref) => {
        ref.lookAt(8, 1.8, 8)
      }}
    >
      <OrbitControls />
    </T.PerspectiveCamera>
    <T.AmbientLight intensity={0.45} />
    <T.DirectionalLight position={[10, 14, 6]} intensity={1.1} />
    <T.Mesh geometry={groundGeometry}>
      <T.MeshStandardMaterial color="#6b8f71" />
    </T.Mesh>
    {#each wall.leafGeometries as leafGeometry}
      <T.Mesh geometry={leafGeometry}>
        <T.MeshStandardMaterial color="#c4b5a0" side={DoubleSide} />
      </T.Mesh>
    {/each}
  </Canvas>
</div>

<style>
  .viewport {
    width: 100%;
    height: 100%;
  }
</style>
