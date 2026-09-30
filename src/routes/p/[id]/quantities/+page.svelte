<script lang="ts">
  import { statusLine } from '$lib/state/status.svelte'
  import QuantitiesView from '$view/quantities/index.svelte'

  $effect(() => {
    statusLine.clear()
  })
</script>

<QuantitiesView />
