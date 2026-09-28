<script lang="ts">
  import DefaultView from './DefaultView.svelte'
  import CsgExperiment from './experiments/csg/index.svelte'
  import OrthoExperiment from './experiments/ortho/index.svelte'
  import TerrainExperiment from './experiments/terrain/index.svelte'

  const exp = new URLSearchParams(window.location.search).get('exp')
</script>

{#if exp === 'ortho'}
  <OrthoExperiment />
{:else if exp === 'terrain'}
  <TerrainExperiment />
{:else if exp === 'csg'}
  <CsgExperiment />
{:else}
  <DefaultView />
{/if}

<style>
  :global(html),
  :global(body),
  :global(#app) {
    height: 100%;
  }
</style>
