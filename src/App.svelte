<script lang="ts">
  import Home from './Home.svelte'
  import CsgExperiment from './experiments/csg/index.svelte'
  import OrthoExperiment from './experiments/ortho/index.svelte'
  import TerrainExperiment from './experiments/terrain/index.svelte'
  import Editor from './view/shell/index.svelte'

  const exp = new URLSearchParams(window.location.search).get('exp')

  const titles: Record<string, string> = {
    ortho: 'Elevation lock',
    terrain: 'Terrain drape',
    csg: 'Window punch',
  }

  const title = exp ? titles[exp] : undefined
</script>

{#if title}
  <div class="shell">
    <header>
      <span>{title}</span>
    </header>
    <div class="stage">
      {#if exp === 'ortho'}
        <OrthoExperiment />
      {:else if exp === 'terrain'}
        <TerrainExperiment />
      {:else if exp === 'csg'}
        <CsgExperiment />
      {/if}
    </div>
  </div>
{:else if exp === 'index'}
  <Home />
{:else}
  <Editor />
{/if}

<style>
  :global(html),
  :global(body),
  :global(#app) {
    background: #f4f4f5;
  }

  .shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  header {
    display: flex;
    align-items: baseline;
    gap: 1rem;
    padding: 0.4rem 0.75rem;
    border-bottom: 1px solid #e4e4e7;
    background: #fff;
    font: 0.8125rem system-ui, sans-serif;
  }

  .stage {
    flex: 1;
    min-height: 0;
  }
</style>
