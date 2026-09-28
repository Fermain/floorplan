<script lang="ts">
  import { useThrelte, useTask } from '@threlte/core'
  import type { OrthographicCamera } from 'three'
  import { configureOrthoCamera } from './elevation'
  import type { WallElevationFrame } from './wallFrame'

  interface Props {
    locked: boolean
    orthoCamera: OrthographicCamera | undefined
    frame: WallElevationFrame
  }

  let { locked, orthoCamera, frame }: Props = $props()

  const { size } = useThrelte()

  useTask(() => {
    if (!locked || !orthoCamera) return
    const { width, height } = size.current
    if (width > 0 && height > 0) {
      configureOrthoCamera(orthoCamera, width / height, frame)
    }
  })
</script>
