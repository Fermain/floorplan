<script lang="ts">
  import { useThrelte, useTask } from '@threlte/core'
  import type { OrthographicCamera } from 'three'
  import { configureOrthoCamera } from './elevation'

  interface Props {
    orthoMode: boolean
    orthoCamera: OrthographicCamera | undefined
  }

  let { orthoMode, orthoCamera }: Props = $props()

  const { size } = useThrelte()

  useTask(() => {
    if (!orthoMode || !orthoCamera) return
    const { width, height } = size.current
    if (width > 0 && height > 0) {
      configureOrthoCamera(orthoCamera, width / height)
    }
  })
</script>
