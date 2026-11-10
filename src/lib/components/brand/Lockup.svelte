<script lang="ts">
  import { asset } from '$app/paths'

  // The Floorplan Pro lockup: the room symbol beside the name, with PRO on the dimension line under it. The small
  // drawing is used, which keeps PRO legible at header height. One file for paper and one for the blueprint.
  let { height = 26, class: className = '' }: { height?: number; class?: string } = $props()
  const width = $derived(Math.round((height * 193.567) / 40))
</script>

<img src={asset('/brand/floorplan-pro-small.svg')} alt="Floorplan Pro" {width} {height} class="block dark:hidden {className}" />
<img src={asset('/brand/floorplan-pro-small-dark.svg')} alt="Floorplan Pro" {width} {height} class="hidden dark:block {className}" />
