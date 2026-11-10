<script lang="ts">
  import { asset } from '$app/paths'

  // The Floorplan lockup: the room symbol beside the name, with a dimension line under it. One file for paper
  // and one for the blueprint.
  let { height = 26, class: className = '' }: { height?: number; class?: string } = $props()
  const width = $derived(Math.round((height * 193.567) / 40))
</script>

<img src={asset('/brand/floorplan.svg')} alt="Floorplan" {width} {height} class="block dark:hidden {className}" />
<img src={asset('/brand/floorplan-dark.svg')} alt="Floorplan" {width} {height} class="hidden dark:block {className}" />
