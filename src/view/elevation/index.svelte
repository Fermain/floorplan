<script lang="ts">
  import type { OrthographicCamera } from 'three'
  import type { BufferGeometry } from 'three'
  import {
    buildOpeningFrameGeometry,
    buildOpeningGlassGeometry,
  } from '../../lib/geometry/frames'
  import { formatSchedule, scheduleWall } from '../../lib/geometry/schedule'
  import { buildCourseFaceGeometries, buildLintelGeometry, buildWallGeometries } from '../../lib/geometry/walls'
  import { doorWidthLimits, maxOpeningWidth, placeOpeningU, windowWidthLimits } from '../../lib/model/openings'
  import type { Floor, Opening, Wall } from '../../lib/model/types'
  import {
    DEFAULT_DOOR_WIDTH,
    DEFAULT_WINDOW_WIDTH,
    DOOR_MIN_WIDTH,
    WINDOW_MIN_WIDTH,
  } from '../../lib/plot/fixture'
  import { documentStore } from '../../lib/state/document.svelte'
  import ElevationScene from './ElevationScene.svelte'
  import { pointerToWallUv } from './elevation'
  import { placeSnappedOpeningU, snapLegalModuleU, snapOpeningVertical, snapOpeningWidth } from './moduleSnap'
  import { computeWallElevationFrame } from './wallFrame'

  interface Props {
    wallId?: string
    selectedOpeningId?: string | null
    onSelectOpening?: (id: string | null) => void
  }

  let { wallId, selectedOpeningId = null, onSelectOpening }: Props = $props()

  let locked = $state(true)
  let insertTool = $state<'door' | 'window'>('window')
  let menuOpen = $state(false)
  let menuEl = $state<HTMLDivElement | undefined>(undefined)
  let doorWidth = $state(DEFAULT_DOOR_WIDTH)
  let windowWidth = $state(DEFAULT_WINDOW_WIDTH)
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

  const editingOpening = $derived.by(() => {
    if (!wall || !selectedOpeningId) return undefined
    return wall.openings.find((item) => item.id === selectedOpeningId)
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

  const widthKind = $derived(editingOpening?.kind ?? insertTool)

  const widthLimits = $derived.by(() => {
    if (!frame) return null
    const base = widthKind === 'door' ? doorWidthLimits(frame.length) : windowWidthLimits(frame.length)
    if (!editingOpening || !wall) return base
    const others = wall.openings.filter((opening) => opening.id !== editingOpening.id)
    const centre = editingOpening.u + editingOpening.width / 2
    const room = maxOpeningWidth(centre, frame.length, others)
    return { min: base.min, max: Math.min(base.max, room) }
  })
  const widthAllowed = $derived(widthLimits !== null && widthLimits.max >= widthLimits.min - 1e-9)

  const shownWidth = $derived.by(() => {
    const fallback = widthKind === 'door' ? doorWidth : windowWidth
    const raw = widthDraft ?? editingOpening?.width ?? fallback
    if (!widthLimits || !widthAllowed) return raw
    return Math.min(widthLimits.max, Math.max(widthLimits.min, raw))
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
    } else if (widthDraft !== null && editingOpening && frame) {
      const centre = editingOpening.u + editingOpening.width / 2
      const others = wall.openings.filter((opening) => opening.id !== editingOpening.id)
      const u = placeOpeningU(centre - shownWidth / 2, shownWidth, frame.length, others)
      if (u !== null) {
        openings = openings.map((opening) =>
          opening.id === editingOpening.id ? { ...opening, u, width: shownWidth } : opening,
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
    courses: BufferGeometry[]
    lintel: BufferGeometry | null
    frame: BufferGeometry | null
    glass: BufferGeometry | null
  } => {
    const shown = displayWall
    if (!floor || !shown) {
      return { blocks: [], courses: [], lintel: null, frame: null, glass: null }
    }
    return {
      blocks: buildWallGeometries(floor, shown),
      courses: buildCourseFaceGeometries(floor, shown),
      lintel: buildLintelGeometry(floor, shown),
      frame: buildOpeningFrameGeometry(floor, shown),
      glass: buildOpeningGlassGeometry(floor, shown),
    }
  })

  const scheduleLine = $derived.by(() => {
    const shown = displayWall
    if (!floor || !shown) return ''
    return formatSchedule(scheduleWall(floor, shown))
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
    const courses = wallModel.courses
    const lintel = wallModel.lintel
    const frameGeom = wallModel.frame
    const glass = wallModel.glass
    return () => {
      for (const g of geoms) g.dispose()
      for (const g of courses) g.dispose()
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
      if (!widthAllowed) return
      const placed = placeSnappedOpeningU(
        uv.u - shownWidth / 2,
        shownWidth,
        frame.length,
        wall.openings,
        DOOR_MIN_WIDTH,
      )
      if (placed === null) return
      selectAdded(documentStore.addOpening(floor.id, wall.id, 'door', placed.u, placed.width))
      return
    }

    const placed = placeSnappedOpeningU(
      uv.u - shownWidth / 2,
      shownWidth,
      frame.length,
      wall.openings,
      WINDOW_MIN_WIDTH,
    )
    if (placed === null) return
    selectAdded(documentStore.addOpening(floor.id, wall.id, 'window', placed.u, placed.width))
  }

  function onWidthInput(value: number) {
    if (editingOpening) widthDraft = value
    else if (insertTool === 'door') doorWidth = value
    else windowWidth = value
  }

  function commitWidth(value: number) {
    widthDraft = null
    const min = widthKind === 'door' ? DOOR_MIN_WIDTH : WINDOW_MIN_WIDTH
    const snapped = snapOpeningWidth(value, min)
    if (!editingOpening || !floor || !wall) {
      if (insertTool === 'door') doorWidth = snapped
      else windowWidth = snapped
      return
    }
    const others = wall.openings.filter((opening) => opening.id !== editingOpening.id)
    const centre = editingOpening.u + editingOpening.width / 2
    const u = frame
      ? snapLegalModuleU(centre - snapped / 2, snapped, frame.length, others)
      : null
    documentStore.updateOpening(floor.id, wall.id, editingOpening.id, {
      width: snapped,
      ...(u === null ? {} : { u }),
    })
  }

  function removeSelected() {
    if (!floor || !wall || !selectedOpeningId) return
    documentStore.removeOpening(floor.id, wall.id, selectedOpeningId)
    onSelectOpening?.(null)
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
    const current = drag
    if (current && floor && wall && frame) {
      const moving = wall.openings.find((opening) => opening.id === current.id)
      if (moving) {
        const others = wall.openings.filter((opening) => opening.id !== current.id)
        const u = snapLegalModuleU(current.u, moving.width, frame.length, others)
        if (u !== null) {
          const moved =
            u !== current.originU || (!current.aligned && current.v !== current.originV)
          if (moved) {
            if (current.aligned) {
              documentStore.updateOpening(floor.id, wall.id, current.id, { u })
            } else {
              const vertical = snapOpeningVertical(current.v, moving.height, frame.height)
              documentStore.updateOpening(floor.id, wall.id, current.id, {
                u,
                v: vertical.v,
                height: vertical.height,
              })
            }
          }
        }
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
      {#if widthLimits && widthAllowed}
        <label class="width">
          Width
          <input
            type="range"
            min={widthLimits.min}
            max={widthLimits.max}
            step="0.01"
            value={shownWidth}
            oninput={(event) => onWidthInput(Number(event.currentTarget.value))}
            onchange={(event) => commitWidth(Number(event.currentTarget.value))}
          />
          <input
            type="number"
            min={mm(widthLimits.min)}
            max={mm(widthLimits.max)}
            step="10"
            value={mm(shownWidth)}
            onchange={(event) => {
              const next = Number(event.currentTarget.value) / 1000
              onWidthInput(next)
              commitWidth(next)
            }}
          />
          <span>mm</span>
        </label>
      {:else if widthKind === 'door'}
        <span class="note">This wall is too short for a door.</span>
      {/if}
      {#if editingOpening}
        <button type="button" onclick={removeSelected}>Remove</button>
      {/if}
      <span class="hint">
        {#if !locked}
          Perspective. The fixed view is where this wall is edited.
        {:else if insertTool === 'door'}
          Click the wall to place a door. Drag a door to move it. Remove deletes the selected one.
        {:else}
          Click the wall to place a window. Drag an opening to move it. Remove deletes the selected one.
        {/if}
      </span>
      {#if scheduleLine}
        <span class="schedule">{scheduleLine}</span>
      {/if}
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
        courseGeometries={wallModel.courses}
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
  .hint,
  .schedule {
    color: #3f3f46;
  }

  .schedule,
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
