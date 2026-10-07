<script lang="ts">
  import { useThrelte } from '@threlte/core'
  import { capturePicture, type PictureQuality } from './capture'

  // Inside the scene, where the renderer can be reached: offers the view the means to take a picture of it.
  let { onReady }: { onReady: (take: (quality: PictureQuality, onProgress?: (done: number, total: number) => void) => Promise<Blob>) => void } = $props()

  const { renderer, scene, camera, invalidate } = useThrelte()

  $effect(() => {
    onReady(async (quality, onProgress) => {
      try {
        return await capturePicture(renderer, scene, camera.current, quality, onProgress)
      } finally {
        invalidate()
      }
    })
  })
</script>
