<script lang="ts">
  import type { OrthographicCamera } from 'three'
  import type { BufferGeometry } from 'three'
  import { buildWallGeometries } from '../../lib/geometry/walls'
  import { bottomSamplesAlong } from '../../lib/geometry/terrain'
  import type { Floor, Opening, Wall } from '../../lib/model/types'
  import { documentStore } from '../../lib/state/document.svelte.ts'
  import ElevationScene from './ElevationScene.svelte'
  import { pointerToWallUv } from './elevation'
  import { computeWallElevationFrame } from './wallFrame'

  interface Props {
    wallId?: string
  }

  let { wallId }: Props = $props()

  let locked = $state(false)
  let unalignedMode = $state(false)
  let doorMode = $state(false)
  let orthoCamera = $state<OrthographicCamera | undefined>(undefined)
  let readout = $state<{ u: number; v: number } | null>(null)

  type Drag = {
    id: string
    originU: number
    originV: number
    u: number
    v: number
    grabU: number
    grabV: number
    aligned: boolean
  }

  let drag = $state<Drag | null>(null)

  const doc = $derived(documentStore.document)

  const located = $derived.by((): { floor: Floor; wall: Wall } | undefined => {
    const floors = doc.building.floors
    if (wallId) {
      for (const floor of floors) {
        const wall = floor.walls.find((w) => w.id === wallId)
        if (wall) return { floor, wall }
      }
      return undefined
    }
    const floor = floors[0]
    const wall = floor?.walls[0]
    if (!floor || !wall) return undefined
    return { floor, wall }
  })

  const floor = $derived(located?.floor)
  const wall = $derived(located?.wall)

  const displayWall = $derived.by((): Wall | undefined => {
    if (!wall || !drag) return wall
    return {
      ...wall,
      openings: wall.openings.map((opening) =>
        opening.id === drag.id
          ? { ...opening, u: drag.u, v: drag.aligned ? opening.v : drag.v }
          : opening,
      ),
    }
  })

  const frame = $derived.by(() => {
    if (!floor || !wall) {
      return undefined
    }
    return computeWallElevationFrame(floor, wall)
  })

  const wallGeometries = $derived.by((): BufferGeometry[] => {
    const shown = displayWall
    if (!floor || !shown) {
      return []
    }
    let samples: { u: number; y: number }[] | undefined
    if (floor.index === 0) {
      const start = floor.corners.find((c) => c.id === shown.startCornerId)
      const end = floor.corners.find((c) => c.id === shown.endCornerId)
      if (start && end) {
        const raw = bottomSamplesAlong(
          doc.heightfield,
          start.x,
          start.z,
          end.x,
          end.z,
        )
        samples = raw.map((s) => ({ u: s.u, y: s.y - floor.datumHeight }))
      }
    }
    return buildWallGeometries(floor, shown, samples)
  })

  $effect(() => {
    const geoms = wallGeometries
    return () => {
      for (const g of geoms) {
        g.dispose()
      }
    }
  })

  function onOrthoCamera(camera: OrthographicCamera) {
    orthoCamera = camera
  }

  function openingAt(w: Wall, u: number, v: number): Opening | undefined {
    for (const o of w.openings) {
      if (u >= o.u && u <= o.u + o.width && v >= o.v && v <= o.v + o.height) {
        return o
      }
    }
    return undefined
  }

  function canvasFromTarget(target: EventTarget | null): {
    canvas: HTMLCanvasElement
    rect: DOMRect
  } | null {
    if (!(target instanceof HTMLElement)) return null
    const canvas = target.querySelector('canvas')
    if (!canvas) return null
    return { canvas, rect: canvas.getBoundingClientRect() }
  }

  function uvFromEvent(event: PointerEvent): { u: number; v: number } | null {
    if (!locked || !orthoCamera || !frame) return null
    const picked = canvasFromTarget(event.currentTarget)
    if (!picked) return null
    const offsetX = event.clientX - picked.rect.left
    const offsetY = event.clientY - picked.rect.top
    return pointerToWallUv(
      orthoCamera,
      offsetX,
      offsetY,
      picked.rect.width,
      picked.rect.height,
      frame,
    )
  }

  function onViewportPointerDown(event: PointerEvent) {
    if (!locked || !floor || !wall || !frame) return
    const uv = uvFromEvent(event)
    if (!uv) return
    readout = uv

    const hit = openingAt(displayWall ?? wall, uv.u, uv.v)
    if (hit) {
      drag = {
        id: hit.id,
        originU: hit.u,
        originV: hit.v,
        u: hit.u,
        v: hit.v,
        grabU: uv.u - hit.u,
        grabV: uv.v - hit.v,
        aligned: hit.aligned,
      }
      ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
      return
    }

    if (doorMode) {
      documentStore.addOpening(floor.id, wall.id, 'door', uv.u)
      return
    }

    if (unalignedMode) {
      documentStore.addOpening(floor.id, wall.id, 'window', uv.u, undefined, uv.v)
      return
    }

    documentStore.addOpening(floor.id, wall.id, 'window', uv.u)
  }

  function onViewportPointerMove(event: PointerEvent) {
    if (!locked || !floor || !wall) return
    const uv = uvFromEvent(event)
    if (!uv) return
    readout = uv

    if (!drag) return
    const u = uv.u - drag.grabU
    const v = drag.aligned ? drag.v : uv.v - drag.grabV
    drag = { ...drag, u, v }
  }

  function onViewportPointerUp(event: PointerEvent) {
    if (drag && floor && wall) {
      const moved =
        drag.u !== drag.originU || (!drag.aligned && drag.v !== drag.originV)
      if (moved) {
        documentStore.updateOpening(
          floor.id,
          wall.id,
          drag.id,
          drag.aligned ? { u: drag.u } : { u: drag.u, v: drag.v },
        )
      }
    }
    drag = null
    const el = event.currentTarget
    if (el instanceof HTMLElement && el.hasPointerCapture(event.pointerId)) {
      el.releasePointerCapture(event.pointerId)
    }
  }
</script>

<div class="root">
  {#if !wall || !frame}
    <p class="empty">No wall selected</p>
  {:else}
    <div class="bar">
      <button type="button" onclick={() => (locked = !locked)}>
        {locked ? 'Perspective view' : 'Lock elevation'}
      </button>
      <label class="toggle">
        <input type="checkbox" bind:checked={unalignedMode} disabled={doorMode} />
        Unaligned
      </label>
      <label class="toggle">
        <input type="checkbox" bind:checked={doorMode} />
        Door
      </label>
      {#if readout}
        <span class="readout">
          u: {readout.u.toFixed(3)} m, v: {readout.v.toFixed(3)} m
        </span>
      {/if}
    </div>
    <div
      class="viewport"
      class:elevation={locked}
      onpointerdown={onViewportPointerDown}
      onpointermove={onViewportPointerMove}
      onpointerup={onViewportPointerUp}
      onpointercancel={onViewportPointerUp}
      role="presentation"
    >
      <ElevationScene
        {locked}
        {frame}
        {wallGeometries}
        {orthoCamera}
        {onOrthoCamera}
      />
    </div>
  {/if}
</div>

<style>
  .root {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
  }

  .empty {
    margin: 1rem;
    font: 0.9375rem system-ui, sans-serif;
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

  .toggle {
    display: flex;
    align-items: center;
    gap: 0.35rem;
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
