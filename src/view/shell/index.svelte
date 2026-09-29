<script lang="ts">
  import { documentStore } from '../../lib/state/document.svelte'
  import ElevationView from '../elevation/index.svelte'
  import PlanView from '../plan/index.svelte'
  import ReviewView from '../review/index.svelte'
  import FileMenu from './FileMenu.svelte'

  type Mode = 'plan' | 'focus' | 'review'
  type Status = { text: string; error: boolean }

  let mode = $state<Mode>('plan')
  let selectedWallId = $state<string | null>(null)
  let selectedOpeningId = $state<string | null>(null)
  let activeFloorId = $state('')
  let importError = $state('')
  let viewStatus = $state<Status>({ text: '', error: false })
  let focusHint = $state('')

  const statusText = $derived(focusHint || importError || viewStatus.text)
  const statusError = $derived(focusHint ? false : Boolean(importError) || viewStatus.error)

  $effect(() => {
    if (selectedWallId) focusHint = ''
  })

  function setViewStatus(status: Status) {
    viewStatus = status
  }

  $effect(() => {
    const doc = documentStore.document
    const wall = selectedWallId
      ? doc.building.floors.flatMap((floor) => floor.walls).find((w) => w.id === selectedWallId)
      : undefined
    if (selectedWallId && !wall) {
      selectedWallId = null
      selectedOpeningId = null
      if (mode === 'focus') mode = 'plan'
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
    const onKey = (event: KeyboardEvent) => {
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
      if (event.key === 'Escape' && currentMode === 'focus') {
        event.preventDefault()
        mode = 'plan'
        return
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      if (currentMode === 'focus' && wallId && openingId) {
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

  function showFocus() {
    if (!selectedWallId) return
    mode = 'focus'
  }

  function selectWallFromReview(wallId: string) {
    selectedWallId = wallId
    selectedOpeningId = null
    mode = 'focus'
  }
</script>

<div class="shell">
  <header>
    <FileMenu {activeFloorId} onError={(message) => (importError = message)} />
    <nav class="modes">
      <button type="button" class:active={mode === 'plan'} onclick={() => (mode = 'plan')}>Plan</button>
      <button
        type="button"
        class:active={mode === 'focus'}
        class:unavailable={!selectedWallId}
        aria-disabled={!selectedWallId}
        title={selectedWallId ? 'Focus' : 'Select a wall'}
        onpointerenter={() => {
          if (!selectedWallId) focusHint = 'Select a wall to open Focus.'
        }}
        onpointerleave={() => (focusHint = '')}
        onclick={showFocus}
      >
        Focus
      </button>
      <button type="button" class:active={mode === 'review'} onclick={() => (mode = 'review')}>Review</button>
    </nav>
  </header>
  <div class="stage">
    {#if mode === 'plan'}
      <PlanView
        bind:selectedWallId
        bind:activeFloorId
        onStatus={setViewStatus}
        onFocus={(wallId) => {
          selectedWallId = wallId
          selectedOpeningId = null
          mode = 'focus'
        }}
      />
    {:else if mode === 'focus' && selectedWallId}
      <ElevationView
        wallId={selectedWallId}
        {selectedOpeningId}
        onSelectOpening={(id) => (selectedOpeningId = id)}
        onStatus={setViewStatus}
      />
    {:else if mode === 'review'}
      <ReviewView onSelectWall={selectWallFromReview} onStatus={setViewStatus} />
    {/if}
  </div>
  <p class="status" class:error={statusError}>{statusText}</p>
</div>

<style>
  .shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #f4f4f5;
  }

  header {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 0.45rem 0.75rem;
    border-bottom: 1px solid #e4e4e7;
    background: #fff;
    font: 0.875rem system-ui, sans-serif;
    position: relative;
    z-index: 2;
  }

  .modes {
    display: flex;
    gap: 0.35rem;
    justify-self: center;
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

  button:disabled,
  button.unavailable {
    color: #a1a1aa;
    cursor: default;
  }

  .stage {
    flex: 1;
    min-height: 0;
  }

  .status {
    margin: 0;
    min-height: 1.25rem;
    padding: 0.4rem 0.75rem;
    border-top: 1px solid #e4e4e7;
    background: #fff;
    color: #3f3f46;
    font: 0.8125rem system-ui, sans-serif;
  }

  .status.error {
    color: #b91c1c;
  }
</style>
