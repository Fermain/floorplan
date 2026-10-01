<script lang="ts">
  import { useTask, useThrelte } from '@threlte/core'
  import { applyCutaway, cut } from './cutaway'

  // How far ahead of the camera the cutaway cone reaches, in metres; 0 turns it off.
  let { depth }: { depth: number } = $props()

  const { scene, camera, invalidate } = useThrelte()

  $effect(() => {
    cut.length.value = depth
    invalidate()
  })

  useTask(
    () => {
      const eye = camera.current
      cut.origin.value.copy(eye.position)
      eye.getWorldDirection(cut.direction.value)
      applyCutaway(scene)
    },
    { autoInvalidate: false },
  )
</script>
