<script lang="ts">
  import type { OrthographicCamera } from 'three'
  import { pointerToWallUv } from './elevation'
  import OrthoScene from './OrthoScene.svelte'

  let orthoMode = $state(false)
  let orthoCamera = $state<OrthographicCamera | undefined>(undefined)
  let readout = $state<{ u: number; v: number } | null>(null)
  let marker = $state<{ u: number; v: number } | null>(null)

  function onOrthoCamera(camera: OrthographicCamera) {
    orthoCamera = camera
  }

  function onViewportPointerDown(event: PointerEvent) {
    if (!orthoMode || !orthoCamera) return
    const target = event.currentTarget as HTMLElement
    const canvas = target.querySelector('canvas')
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const offsetX = event.clientX - rect.left
    const offsetY = event.clientY - rect.top
    const uv = pointerToWallUv(orthoCamera, offsetX, offsetY, rect.width, rect.height)
    readout = uv
    marker = uv
  }
</script>

<div class="root">
  <div class="bar">
    <button type="button" onclick={() => (orthoMode = !orthoMode)}>
      {orthoMode ? 'Perspective view' : 'Elevation (ortho) view'}
    </button>
    {#if readout}
      <span class="readout">
        u: {readout.u.toFixed(3)} m, v: {readout.v.toFixed(3)} m
      </span>
    {/if}
  </div>
  <div
    class="viewport"
    class:elevation={orthoMode}
    onpointerdown={onViewportPointerDown}
    role="presentation"
  >
    <OrthoScene {orthoMode} {orthoCamera} {marker} {onOrthoCamera} />
  </div>
</div>

<style>
  .root {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    font: 0.9375rem system-ui, sans-serif;
    border-bottom: 1px solid #ddd;
    flex-shrink: 0;
  }

  .bar button {
    font: inherit;
    padding: 0.35rem 0.75rem;
    cursor: pointer;
  }

  .readout {
    font-variant-numeric: tabular-nums;
  }

  .viewport {
    flex: 1;
    min-height: 0;
    width: 100%;
  }

  .viewport.elevation {
    cursor: crosshair;
  }

  .viewport :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
