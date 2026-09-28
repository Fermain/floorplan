<script lang="ts">
  import { Canvas, T } from '@threlte/core'
  import { OrbitControls } from '@threlte/extras'
  import { buildThreeCsgTsWallMesh } from './builders.js'
  import { WALL_HEIGHT_M, WALL_LENGTH_M } from './params.js'

  const wall = buildThreeCsgTsWallMesh()
  const lookX = WALL_LENGTH_M / 2
  const lookY = WALL_HEIGHT_M / 2
</script>

<div class="viewport">
  <Canvas>
    <T.PerspectiveCamera
      makeDefault
      position={[lookX, lookY + 1.5, 5]}
      oncreate={(ref) => {
        ref.lookAt(lookX, lookY, 0)
      }}
    >
      <OrbitControls target={[lookX, lookY, 0]} />
    </T.PerspectiveCamera>
    <T.AmbientLight intensity={0.45} />
    <T.DirectionalLight position={[lookX + 2, WALL_HEIGHT_M + 2, 4]} intensity={1.1} />
    <T.Mesh geometry={wall.geometry} material={wall.material} />
  </Canvas>
</div>

<style>
  .viewport {
    width: 100%;
    height: 100%;
  }
</style>
