<script lang="ts">
  import { exportFloorSvg } from '../../lib/export/svg'
  import { loadHeightfield, loadPlot } from '../../lib/plot/load'
  import { documentStore } from '../../lib/state/document.svelte'
  import ElevationView from '../elevation/index.svelte'
  import PlanView from '../plan/index.svelte'
  import ReviewView from '../review/index.svelte'

  type Mode = 'plan' | 'elevation' | 'review'

  let mode = $state<Mode>('plan')
  let selectedWallId = $state<string | null>(null)
  let selectedOpeningId = $state<string | null>(null)
  let activeFloorId = $state('')
  let importError = $state('')
  let importOpen = $state(false)
  let importMenuEl = $state<HTMLDivElement | undefined>(undefined)

  $effect(() => {
    const doc = documentStore.document
    const wall = selectedWallId
      ? doc.building.floors.flatMap((floor) => floor.walls).find((w) => w.id === selectedWallId)
      : undefined
    if (selectedWallId && !wall) {
      selectedWallId = null
      selectedOpeningId = null
      if (mode === 'elevation') mode = 'plan'
      return
    }
    if (selectedOpeningId && wall && !wall.openings.some((o) => o.id === selectedOpeningId)) {
      selectedOpeningId = null
    }
  })

  $effect(() => {
    const currentMode = mode
    const wallId = selectedWallId
    const openingId = selectedOpeningId
    const menuOpen = importOpen
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menuOpen) {
        event.preventDefault()
        event.stopImmediatePropagation()
        importOpen = false
        return
      }
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
      }
      const meta = event.metaKey || event.ctrlKey
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) documentStore.redo()
        else documentStore.undo()
        return
      }
      if (meta && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        documentStore.redo()
        return
      }
      if (event.key === 'Escape' && currentMode === 'elevation') {
        event.preventDefault()
        mode = 'plan'
        return
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      if (currentMode === 'elevation' && wallId && openingId) {
        const floorId = floorContaining(wallId)
        if (!floorId) return
        event.preventDefault()
        documentStore.removeOpening(floorId, wallId, openingId)
        return
      }
      if (wallId) {
        const floorId = floorContaining(wallId)
        if (!floorId) return
        event.preventDefault()
        documentStore.removeWall(floorId, wallId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function floorContaining(wallId: string): string | undefined {
    return documentStore.document.building.floors.find((floor) =>
      floor.walls.some((wall) => wall.id === wallId),
    )?.id
  }

  function downloadSvg() {
    const floorId = activeFloorId || documentStore.document.building.floors[0]?.id
    if (!floorId) return
    const svg = exportFloorSvg(documentStore.document, floorId)
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'floor.svg'
    link.click()
    URL.revokeObjectURL(url)
  }

  $effect(() => {
    if (!importOpen) return
    const menu = importMenuEl
    const onPointer = (event: PointerEvent) => {
      const target = event.target
      if (menu && target instanceof Node && menu.contains(target)) return
      importOpen = false
      if (target instanceof Element && target.closest('header')) return
      event.stopPropagation()
    }
    window.addEventListener('pointerdown', onPointer, true)
    return () => window.removeEventListener('pointerdown', onPointer, true)
  })

  function showElevation() {
    if (!selectedWallId) return
    mode = 'elevation'
  }

  function explainImport(reason: string): string {
    if (reason === 'existing walls leave the new plot') {
      return 'Those walls sit outside the new plot. Remove them, or import a ring that contains them.'
    }
    return reason
  }

  async function readFile(event: Event): Promise<string | undefined> {
    const input = event.currentTarget
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return
    const text = await input.files[0].text()
    input.value = ''
    return text
  }

  async function onPlotFile(event: Event) {
    const text = await readFile(event)
    if (!text) return
    try {
      const result = documentStore.replacePlot(loadPlot(text))
      importError = result.ok ? '' : explainImport(result.reason)
    } catch (err) {
      importError = err instanceof Error ? err.message : 'Could not read the plot.'
    }
  }

  async function onHeightFile(event: Event) {
    const text = await readFile(event)
    if (!text) return
    try {
      const result = documentStore.replaceHeightfield(loadHeightfield(text))
      importError = result.ok ? '' : explainImport(result.reason)
    } catch (err) {
      importError = err instanceof Error ? err.message : 'Could not read the heightfield.'
    }
  }
</script>

<div class="shell">
  <header>
    <nav>
      <button type="button" class:active={mode === 'plan'} onclick={() => (mode = 'plan')}>Plan</button>
      <button type="button" class:active={mode === 'elevation'} disabled={!selectedWallId} onclick={showElevation}>
        Elevation
      </button>
      <button type="button" class:active={mode === 'review'} onclick={() => (mode = 'review')}>Review</button>
      <div class="menu" bind:this={importMenuEl}>
        <button
          type="button"
          class:active={importOpen}
          aria-expanded={importOpen}
          aria-haspopup="menu"
          onclick={() => (importOpen = !importOpen)}
        >
          Import
        </button>
        {#if importOpen}
          <div class="menu-panel" role="menu">
            <label class="file">
              Import plot
              <input
                type="file"
                accept=".geojson,.json,.kml,application/geo+json"
                onchange={(event) => {
                  importOpen = false
                  onPlotFile(event)
                }}
              />
            </label>
            <label class="file">
              Import height
              <input
                type="file"
                accept=".json,application/json"
                onchange={(event) => {
                  importOpen = false
                  onHeightFile(event)
                }}
              />
            </label>
            <button
              type="button"
              role="menuitem"
              onclick={() => {
                importOpen = false
                downloadSvg()
              }}
            >
              Export SVG
            </button>
          </div>
        {/if}
      </div>
    </nav>
    {#if importError}
      <p class="error">{importError}</p>
    {/if}
  </header>
  <div class="stage">
    {#if mode === 'plan'}
      <PlanView bind:selectedWallId bind:activeFloorId />
    {:else if mode === 'elevation' && selectedWallId}
      <ElevationView wallId={selectedWallId} onSelectOpening={(id) => (selectedOpeningId = id)} />
    {:else if mode === 'review'}
      <ReviewView />
    {/if}
  </div>
</div>

<style>
  .shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #f4f4f5;
  }

  header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
    padding: 0.45rem 0.75rem;
    border-bottom: 1px solid #e4e4e7;
    background: #fff;
    font: 0.875rem system-ui, sans-serif;
    position: relative;
    z-index: 2;
  }

  nav {
    display: flex;
    gap: 0.35rem;
  }

  .menu {
    position: relative;
    margin-left: 0.65rem;
  }

  .menu-panel {
    position: absolute;
    top: calc(100% + 0.35rem);
    left: 0;
    z-index: 3;
    display: flex;
    flex-direction: column;
    min-width: 11rem;
    padding: 0.25rem;
    border: 1px solid #d4d4d8;
    border-radius: 4px;
    background: #fff;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
  }

  .menu-panel button,
  .menu-panel label.file {
    display: block;
    width: 100%;
    border: none;
    border-radius: 3px;
    background: transparent;
    text-align: left;
  }

  .menu-panel button:hover,
  .menu-panel label.file:hover {
    background: #f4f4f5;
  }

  button {
    padding: 0.35rem 0.65rem;
    border: 1px solid #d4d4d8;
    border-radius: 4px;
    background: #fff;
    font: inherit;
    cursor: pointer;
  }

  button.active {
    border-color: #2563eb;
    background: #eff6ff;
  }

  button:disabled {
    color: #a1a1aa;
    cursor: default;
  }

  label.file {
    padding: 0.35rem 0.65rem;
    border: 1px solid #d4d4d8;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
  }

  label.file input {
    display: none;
  }

  .error {
    margin: 0;
    color: #b91c1c;
  }

  .stage {
    flex: 1;
    min-height: 0;
  }
</style>
