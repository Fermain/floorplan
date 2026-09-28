<script lang="ts">
  import { Canvas, T } from '@threlte/core'
  import { OrbitControls } from '@threlte/extras'
</script>

<div class="viewport">
  <Canvas>
    <T.PerspectiveCamera
      makeDefault
      position={[4, 4, 4]}
      oncreate={(ref) => {
        ref.lookAt(0, 0, 0)
      }}
    >
      <OrbitControls />
    </T.PerspectiveCamera>
    <T.AmbientLight intensity={0.4} />
    <T.DirectionalLight position={[5, 8, 5]} intensity={1.2} />
    <T.Mesh>
      <T.BoxGeometry args={[1, 1, 1]} />
      <T.MeshStandardMaterial color="#5b8def" />
    </T.Mesh>
  </Canvas>
</div>

<style>
  .viewport {
    width: 100%;
    height: 100%;
  }
</style>
