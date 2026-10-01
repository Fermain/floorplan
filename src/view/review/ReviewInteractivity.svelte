<script lang="ts">
  import type { Snippet } from 'svelte'
  import { interactivity } from '@threlte/extras'

  // Pointer events reach only the objects below the component that turns them on, so the scene goes inside.
  let { children }: { children: Snippet } = $props()

  interactivity()
</script>

{@render children()}
