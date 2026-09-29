<script lang="ts">
  import type { OrthographicCamera } from 'three'
  import type { BufferGeometry } from 'three'
  import {
  buildOpeningFrameGeometry,
  buildOpeningGlassGeometry,
  buildOpeningPanelMeshes,
  type OpeningPanelMesh,
} from '../../lib/geometry/frames'
import { formatSchedule, scheduleWall } from '../../lib/geometry/schedule'
import { buildCourseFaceGeometries, buildLintelGeometry, buildWallGeometries } from '../../lib/geometry/walls'
import { isFloorOpening, maxOpeningWidth, openingMinWidth, openingWidthLimits, placeOpeningU } from '../../lib/model/openings'
import type { Floor, Opening, OpeningKind, Wall } from '../../lib/model/types'
import {
  DEFAULT_DOOR_WIDTH,
  DEFAULT_EXTERNAL_DOOR_WIDTH,
  DEFAULT_GARAGE_WIDTH,
  DEFAULT_INTERNAL_DOOR_WIDTH,
  DEFAULT_PORTAL_WIDTH,
  DEFAULT_WINDOW_WIDTH,
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
    onStatus?: (status: { text: string; error: boolean }) => void
  }

  let { wallId, selectedOpeningId = null, onSelectOpening, onStatus }: Props = $props()

  let locked = $state(true)
  let insertTool = $state<OpeningKind>('window')
  let menuOpen = $state(false)
  let menuEl = $state<HTMLDivElement | undefined>(undefined)
  let preferredWidth = $state<Record<OpeningKind, number>>({
    window: DEFAULT_WINDOW_WIDTH,
    door: DEFAULT_DOOR_WIDTH,
    'external-door': DEFAULT_EXTERNAL_DOOR_WIDTH,
    'internal-door': DEFAULT_INTERNAL_DOOR_WIDTH,
    garage: DEFAULT_GARAGE_WIDTH,
    portal: DEFAULT_PORTAL_WIDTH,
  })
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
    const base = openingWidthLimits(widthKind, frame.length)
    if (!editingOpening || !wall) return base
    const others = wall.openings.filter((opening) => opening.id !== editingOpening.id)
    const centre = editingOpening.u + editingOpening.width / 2
    const room = maxOpeningWidth(centre, frame.length, others)
    return { min: base.min, max: Math.min(base.max, room) }
  })
  const widthAllowed = $derived(widthLimits !== null && widthLimits.max >= widthLimits.min - 1e-9)

  const shownWidth = $derived.by(() => {
    const fallback = preferredWidth[widthKind]
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
    panels: OpeningPanelMesh[]
  } => {
    const shown = displayWall
    if (!floor || !shown) {
      return { blocks: [], courses: [], lintel: null, frame: null, glass: null, panels: [] }
    }
    return {
      blocks: buildWallGeometries(floor, shown),
      courses: buildCourseFaceGeometries(floor, shown),
      lintel: buildLintelGeometry(floor, shown),
      frame: buildOpeningFrameGeometry(floor, shown),
      glass: buildOpeningGlassGeometry(floor, shown),
      panels: buildOpeningPanelMeshes(floor, shown),
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
    const panels = wallModel.panels
    return () => {
      for (const g of geoms) g.dispose()
      for (const g of courses) g.dispose()
      lintel?.dispose()
      frameGeom?.dispose()
      glass?.dispose()
      for (const panel of panels) panel.geometry.dispose()
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

    const min = openingMinWidth(insertTool)
    const placed = placeSnappedOpeningU(uv.u - shownWidth / 2, shownWidth, frame.length, wall.openings, min)
    if (placed === null) return
    selectAdded(documentStore.addOpening(floor.id, wall.id, insertTool, placed.u, placed.width))
  }

  function onWidthInput(value: number) {
    if (editingOpening) widthDraft = value
    else preferredWidth[insertTool] = value
  }

  function commitWidth(value: number) {
    widthDraft = null
    const snapped = snapOpeningWidth(value, openingMinWidth(widthKind))
    if (!editingOpening || !floor || !wall) {
      preferredWidth[insertTool] = snapped
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

  function chooseInsert(tool: OpeningKind) {
    insertTool = tool
    menuOpen = false
  }

  const insertChoices: { kind: OpeningKind; label: string }[] = [
    { kind: 'window', label: 'Window' },
    { kind: 'door', label: 'Sliding door' },
    { kind: 'external-door', label: 'External door' },
    { kind: 'internal-door', label: 'Internal door' },
    { kind: 'garage', label: 'Garage door' },
    { kind: 'portal', label: 'Portal' },
  ]

  $effect(() => {
    onStatus?.(focusStatus())
    return () => onStatus?.({ text: '', error: false })
  })

  function focusStatus(): { text: string; error: boolean } {
    if (!wall || !frame) return { text: '', error: false }
    if (widthLimits && !widthAllowed) {
      const noun =
        widthKind === 'garage'
          ? 'a garage door'
          : widthKind === 'portal'
            ? 'a portal'
            : isFloorOpening(widthKind)
              ? 'a door'
              : 'a window'
      return { text: `This wall is too short for ${noun}.`, error: true }
    }
    if (readout) {
      const parts = [`u ${mm(readout.u)} mm`, `v ${mm(readout.v)} mm`]
      if (selectedOpening) {
        parts.push(
          `width ${mm(selectedOpening.width)} mm`,
          `height ${mm(selectedOpening.height)} mm`,
          `sill ${mm(selectedOpening.v)} mm`,
          `head ${mm(selectedOpening.v + selectedOpening.height)} mm`,
        )
      }
      return { text: parts.join(', '), error: false }
    }
    if (!locked) return { text: 'Perspective. The fixed view is where this wall is edited.', error: false }
    if (wall.openings.length > 0 && scheduleLine) return { text: scheduleLine, error: false }
    return { text: insertHint(insertTool), error: false }
  }

  function insertHint(kind: OpeningKind): string {
    if (kind === 'window') return 'Click the wall to place a window.'
    if (kind === 'garage') return 'Click the wall to place a garage door.'
    if (kind === 'external-door') return 'Click the wall to place an external door.'
    if (kind === 'internal-door') return 'Click the wall to place an internal door.'
    if (kind === 'portal') return 'Click the wall to place a portal.'
    return 'Click the wall to place a sliding door.'
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
            {#each insertChoices as choice (choice.kind)}
              <button
                type="button"
                role="menuitem"
                class:active={insertTool === choice.kind}
                onclick={() => chooseInsert(choice.kind)}
              >
                {choice.label}
              </button>
            {/each}
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
      {/if}
      {#if editingOpening}
        <button type="button" onclick={removeSelected}>Remove</button>
      {/if}
    </div>
    <div class="scene">
      <button type="button" class="lock" onclick={() => (locked = !locked)}>
        {locked ? 'Perspective' : 'Fixed view'}
      </button>
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
        panelMeshes={wallModel.panels}
        {orthoCamera}
        {onOrthoCamera}
      />
      </div>
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
    padding: 0.5rem 0.75rem;
    background: #fff;
    border-bottom: 1px solid #e4e4e7;
    font: 0.875rem system-ui, sans-serif;
    flex-shrink: 0;
  }

  .bar button {
    padding: 0.35rem 0.65rem;
    border: 1px solid #d4d4d8;
    border-radius: 4px;
    background: #fff;
    font: inherit;
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

  .scene {
    position: relative;
    display: flex;
    flex: 1;
    min-height: 0;
    width: 100%;
  }

  .lock {
    position: absolute;
    top: 0.75rem;
    left: 0.75rem;
    z-index: 1;
    padding: 0.35rem 0.75rem;
    border: 1px solid #d4d4d8;
    border-radius: 4px;
    background: #fff;
    font: 0.875rem system-ui, sans-serif;
    cursor: pointer;
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
