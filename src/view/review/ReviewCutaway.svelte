<script lang="ts">
  import { useTask, useThrelte } from '@threlte/core'
  import { Vector3 } from 'three'
  import { aimCut, applyCutaway, cut, type CutShape } from './cutaway'

  // How far ahead of the camera the cutaway reaches, in metres (0 turns it off), and its shape.
  let { depth, shape = 'box' }: { depth: number; shape?: CutShape } = $props()

  const { scene, camera, invalidate } = useThrelte()

  $effect(() => {
    cut.length.value = depth
    cut.shape.value = shape === 'cone' ? 0 : 1
    invalidate()
  })

  const looking = new Vector3()

  useTask(
    () => {
      const eye = camera.current
      aimCut(eye.position, eye.getWorldDirection(looking))
      applyCutaway(scene)
    },
    { autoInvalidate: false },
  )
</script>
