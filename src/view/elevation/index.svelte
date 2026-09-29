<script lang="ts">
  import type { OrthographicCamera } from 'three'
  import type { BufferGeometry } from 'three'
  import {
    buildOpeningFrameGeometry,
    buildOpeningGlassGeometry,
  } from '../../lib/geometry/frames'
  import { buildLintelGeometry, buildWallGeometries } from '../../lib/geometry/walls'
  import { doorWidthLimits, maxOpeningWidth, placeOpeningU } from '../../lib/model/openings'
  import type { Floor, Opening, Wall } from '../../lib/model/types'
  import { DEFAULT_DOOR_WIDTH, DEFAULT_WINDOW_WIDTH } from '../../lib/plot/fixture'
  import { documentStore } from '../../lib/state/document.svelte'
  import ElevationScene from './ElevationScene.svelte'
  import { pointerToWallUv } from './elevation'
  import { computeWallElevationFrame } from './wallFrame'

  interface Props {
    wallId?: string
    selectedOpeningId?: string | null
    onSelectOpening?: (id: string) => void
  }

  let { wallId, selectedOpeningId = null, onSelectOpening }: Props = $props()

  let locked = $state(true)
  let insertTool = $state<'door' | 'window'>('window')
  let menuOpen = $state(false)
  let menuEl = $state<HTMLDivElement | undefined>(undefined)
  let doorWidth = $state(DEFAULT_DOOR_WIDTH)
  let widthDraft = $state<number | null>(null)
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

  const editingDoor = $derived.by(() => {
    if (!wall || !selectedOpeningId) return undefined
    const opening = wall.openings.find((item) => item.id === selectedOpeningId)
    return opening?.kind === 'door' ? opening : undefined
  })

  function mm(m: number): number {
    return Math.round(m * 1000)
  }

  const frame = $derived.by(() => {
    if (!floor || !wall) {
      return undefined
    }
    return computeWallElevationFrame(floor, wall)
  })

  const doorLimits = $derived.by(() => {
    if (!frame) return null
    const base = doorWidthLimits(frame.length)
    if (!editingDoor || !wall) return base
    const others = wall.openings.filter((opening) => opening.id !== editingDoor.id)
    const centre = editingDoor.u + editingDoor.width / 2
    const room = maxOpeningWidth(centre, frame.length, others)
    return { min: base.min, max: Math.min(base.max, room) }
  })
  const doorAllowed = $derived(doorLimits !== null && doorLimits.max >= doorLimits.min - 1e-9)

  const shownDoorWidth = $derived.by(() => {
    const raw = widthDraft ?? editingDoor?.width ?? doorWidth
    if (!doorLimits || !doorAllowed) return raw
    return Math.min(doorLimits.max, Math.max(doorLimits.min, raw))
  })

  const displayWall = $derived.by((): Wall | undefined => {
    if (!wall) return wall
    let openings = wall.openings
    const current = drag
    if (current) {
      openings = openings.map((opening) =>
        opening.id === current.id
          ? { ...opening, u: current.u, v: current.aligned ? opening.v : current.v }
          : opening,
      )
    } else if (widthDraft !== null && editingDoor && frame) {
      const centre = editingDoor.u + editingDoor.width / 2
      const others = wall.openings.filter((opening) => opening.id !== editingDoor.id)
      const u = placeOpeningU(centre - shownDoorWidth / 2, shownDoorWidth, frame.length, others)
      if (u !== null) {
        openings = openings.map((opening) =>
          opening.id === editingDoor.id ? { ...opening, u, width: shownDoorWidth } : opening,
        )
      }
    }
    if (openings === wall.openings) return wall
    return { ...wall, openings }
  })

  const selectedOpening = $derived.by(() => {
    if (!selectedOpeningId) return undefined
    const shown = displayWall ?? wall
    return shown?.openings.find((item) => item.id === selectedOpeningId)
  })

  const wallModel = $derived.by((): {
    blocks: BufferGeometry[]
    lintel: BufferGeometry | null
    frame: BufferGeometry | null
    glass: BufferGeometry | null
  } => {
    const shown = displayWall
    if (!floor || !shown) {
      return { blocks: [], lintel: null, frame: null, glass: null }
    }
    return {
      blocks: buildWallGeometries(floor, shown),
      lintel: buildLintelGeometry(floor, shown),
      frame: buildOpeningFrameGeometry(floor, shown),
      glass: buildOpeningGlassGeometry(floor, shown),
    }
  })

  $effect(() => {
    selectedOpeningId
    widthDraft = null
  })

  $effect(() => {
    if (!menuOpen) return
    const menu = menuEl
    const onPointer = (event: PointerEvent) => {
      const target = event.target
      if (menu && target instanceof Node && menu.contains(target)) return
      menuOpen = false
    }
    window.addEventListener('pointerdown', onPointer, true)
    return () => window.removeEventListener('pointerdown', onPointer, true)
  })

  $effect(() => {
    const geoms = wallModel.blocks
    const lintel = wallModel.lintel
    const frameGeom = wallModel.frame
    const glass = wallModel.glass
    return () => {
      for (const g of geoms) {
        g.dispose()
      }
      lintel?.dispose()
      frameGeom?.dispose()
      glass?.dispose()
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
      onSelectOpening?.(hit.id)
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

    if (insertTool === 'door') {
      if (!doorAllowed) return
      const u = placeOpeningU(uv.u - shownDoorWidth / 2, shownDoorWidth, frame.length, wall.openings)
      if (u === null) return
      selectAdded(documentStore.addOpening(floor.id, wall.id, 'door', u, shownDoorWidth))
      return
    }

    const windowU = placeOpeningU(uv.u - DEFAULT_WINDOW_WIDTH / 2, DEFAULT_WINDOW_WIDTH, frame.length, wall.openings)
    if (windowU === null) return
    selectAdded(documentStore.addOpening(floor.id, wall.id, 'window', windowU))
  }

  function onDoorWidthInput(value: number) {
    if (editingDoor) widthDraft = value
    else doorWidth = value
  }

  function commitDoorWidth(value: number) {
    widthDraft = null
    if (!editingDoor || !floor || !wall) {
      doorWidth = value
      return
    }
    documentStore.updateOpening(floor.id, wall.id, editingDoor.id, { width: value })
  }

  function chooseInsert(tool: 'door' | 'window') {
    insertTool = tool
    menuOpen = false
  }

  function selectAdded(result: { ok: boolean; document: typeof doc }): void {
    if (!result.ok || !floor || !wall) return
    const id = result.document.building.floors
      .find((f) => f.id === floor.id)
      ?.walls.find((w) => w.id === wall.id)
      ?.openings.at(-1)?.id
    if (id) onSelectOpening?.(id)
  }

  function onViewportPointerMove(event: PointerEvent) {
    if (!locked || !floor || !wall) return
    const uv = uvFromEvent(event)
    if (!uv) return
    readout = uv

    const current = drag
    if (!current || !frame) return
    const moving = wall.openings.find((opening) => opening.id === current.id)
    if (!moving) return
    const others = wall.openings.filter((opening) => opening.id !== current.id)
    const u = placeOpeningU(uv.u - current.grabU, moving.width, frame.length, others)
    if (u === null) return
    const v = current.aligned ? current.v : uv.v - current.grabV
    drag = { ...current, u, v }
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
        {locked ? 'Perspective' : 'Fixed view'}
      </button>
      <div class="menu" bind:this={menuEl}>
        <button
          type="button"
          class:active={menuOpen}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onclick={() => (menuOpen = !menuOpen)}
        >
          Openings
        </button>
        {#if menuOpen}
          <div class="menu-panel" role="menu">
            <p class="section">Openings</p>
            <button
              type="button"
              role="menuitem"
              class:active={insertTool === 'door'}
              onclick={() => chooseInsert('door')}
            >
              Door
            </button>
            <button
              type="button"
              role="menuitem"
              class:active={insertTool === 'window'}
              onclick={() => chooseInsert('window')}
            >
              Window
            </button>
          </div>
        {/if}
      </div>
      {#if insertTool === 'door' || editingDoor}
        {#if doorLimits && doorAllowed}
          <label class="width">
            Width
            <input
              type="range"
              min={doorLimits.min}
              max={doorLimits.max}
              step="0.01"
              value={shownDoorWidth}
              oninput={(event) => onDoorWidthInput(Number(event.currentTarget.value))}
              onchange={(event) => commitDoorWidth(Number(event.currentTarget.value))}
            />
            <input
              type="number"
              min={doorLimits.min}
              max={doorLimits.max}
              step="0.01"
              value={shownDoorWidth}
              onchange={(event) => {
                const next = Number(event.currentTarget.value)
                onDoorWidthInput(next)
                commitDoorWidth(next)
              }}
            />
            <span>m</span>
          </label>
        {:else}
          <span class="note">This wall is too short for a door.</span>
        {/if}
      {/if}
      <span class="hint">
        {#if !locked}
          Perspective. The fixed view is where this wall is edited.
        {:else if insertTool === 'door'}
          Click the wall to place a door. Drag a door to move it.
        {:else}
          Click the wall to place a window. Drag an opening to move it.
        {/if}
      </span>
      {#if readout}
        <span class="readout">
          u: {mm(readout.u)} mm, v: {mm(readout.v)} mm
          {#if selectedOpening}
            , width: {mm(selectedOpening.width)} mm, height: {mm(selectedOpening.height)} mm, sill:
            {mm(selectedOpening.v)} mm, head: {mm(selectedOpening.v + selectedOpening.height)} mm
          {/if}
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
        wallGeometries={wallModel.blocks}
        lintelGeometry={wallModel.lintel}
        frameGeometry={wallModel.frame}
        glassGeometry={wallModel.glass}
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
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
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

  .menu {
    position: relative;
  }

  .menu > button.active,
  .menu-panel button.active {
    border-color: #2563eb;
    background: #eff6ff;
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

  .menu-panel button {
    display: block;
    width: 100%;
    border: none;
    border-radius: 3px;
    background: transparent;
    text-align: left;
  }

  .menu-panel button:hover {
    background: #f4f4f5;
  }

  .section {
    margin: 0.35rem 0.65rem 0.15rem;
    font-size: 0.75rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #71717a;
  }

  .width {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .width input[type='range'] {
    width: 8rem;
  }

  .width input[type='number'] {
    width: 4.5rem;
    font: inherit;
  }

  .note,
  .hint {
    color: #3f3f46;
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
