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
import {
  defaultOpeningDimensions,
  isFloorOpening,
  maxOpeningWidth,
  openingMinWidth,
  openingWidthLimits,
  placeOpeningU,
} from '../../lib/model/openings'
import { systemOf, WALL_SYSTEMS } from '../../lib/model/systems'
import type { Floor, Opening, OpeningKind, Wall, WallSystemId } from '../../lib/model/types'
  import { documentStore } from '../../lib/state/document.svelte'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import * as Select from '$lib/components/ui/select'
  import { Separator } from '$lib/components/ui/separator'
  import ElevationScene from './ElevationScene.svelte'
  import ElevationDimensions from './ElevationDimensions.svelte'
  import { SURFACE_BED_TOP_ABOVE_DATUM_M } from '../../lib/geometry/pad'
  import { WALL_HEAD } from '../../lib/plot/fixture'
  import { configureOrthoCamera, pointerToWallUv } from './elevation'
  import { placeSnappedOpeningU, snapLegalModuleU, snapOpeningVertical, snapOpeningWidth } from './moduleSnap'
  import { computeWallElevationFrame, flipFrame } from './wallFrame'
  import { defaultWallSide, wallFaces, type WallSide } from '../../lib/geometry/spaces'
  import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right'
  import { buildFenceParts, fenceFrame, type FencePart } from '../../lib/geometry/fence'
  import {
    DEFAULT_FENCE_HEIGHT_M,
    FENCE_MAX_HEIGHT_M,
    FENCE_MIN_HEIGHT_M,
    FENCES,
    fencePosts,
    fenceSpec,
  } from '../../lib/model/fences'
  import type { FenceType, SupportType } from '../../lib/model/types'
  import {
    defaultSupport,
    evenPositions,
    SUPPORT_HEIGHT_M,
    SUPPORT_MAX_SPACING_M,
    SUPPORT_MIN_SPACING_M,
    SUPPORTS,
    supportSpec,
  } from '../../lib/model/supports'
  import { buildPillarParts, type PillarPart } from '../../lib/geometry/pillars'
  import { wallSystem } from '../../lib/model/systems'

  interface Props {
    wallId?: string
    selectedOpeningId?: string | null
    onSelectOpening?: (id: string | null) => void
    onStatus?: (status: { text: string; error: boolean }) => void
  }

  let { wallId, selectedOpeningId = null, onSelectOpening, onStatus }: Props = $props()

  let locked = $state(true)
  let insertTool = $state<OpeningKind>('window')
  let preferredWidth = $state<Partial<Record<OpeningKind, number>>>({})
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
  const system = $derived(systemOf(wall ?? { skin: 'double' }))
  const gap = $derived(system.moduleLength)

  const editingOpening = $derived.by(() => {
    if (!wall || !selectedOpeningId) return undefined
    return wall.openings.find((item) => item.id === selectedOpeningId)
  })

  function mm(m: number): number {
    return Math.round(m * 1000)
  }

  const logical = $derived(wall?.skin === 'logical')
  const fence = $derived(logical ? wall?.fence : undefined)
  const support = $derived(logical ? wall?.support : undefined)

  const frame = $derived.by(() => {
    if (!floor || !wall) {
      return undefined
    }
    if (logical) {
      const tallest = Math.max(fence?.height ?? 0, support ? SUPPORT_HEIGHT_M : 0)
      return computeWallElevationFrame(floor, wall, Math.max(1.2, tallest + 0.4))
    }
    return computeWallElevationFrame(floor, wall)
  })

  const faces = $derived(floor && wall ? wallFaces(floor, wall.id) : null)
  let sideChoice = $state<{ wallId: string; side: WallSide } | null>(null)
  const side = $derived<WallSide>(
    sideChoice && sideChoice.wallId === wall?.id ? sideChoice.side : defaultWallSide(faces),
  )
  const viewFrame = $derived(frame && side === -1 ? flipFrame(frame) : frame)
  const viewFace = $derived(faces?.find((face) => face.side === side) ?? null)
  const farFace = $derived(faces?.find((face) => face.side !== side) ?? null)

  function flipSide() {
    if (!wall) return
    sideChoice = { wallId: wall.id, side: side === 1 ? -1 : 1 }
  }

  $effect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'f' && event.key !== 'F') return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      event.preventDefault()
      flipSide()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Openings as seen from the current face: measured from the left of the view.
  function shownOpenings(openings: Opening[]): Opening[] {
    if (side === 1 || !frame) return openings
    const length = frame.length
    return openings.map((opening) => ({ ...opening, u: length - opening.u - opening.width }))
  }

  const fenceParts = $derived.by((): FencePart[] => {
    if (!floor || !wall || !fence) return []
    const line = fenceFrame(floor, wall)
    const base = floor.datumHeight
    return line ? buildFenceParts(line, fence, () => base) : []
  })

  $effect(() => {
    const parts = fenceParts
    return () => {
      for (const part of parts) part.geometry.dispose()
    }
  })

  const supportSpots = $derived.by(() => {
    if (!floor || !wall || !support) return []
    const line = fenceFrame(floor, wall)
    if (!line) return []
    return evenPositions(line.length, support.spacing).map((u) => ({
      x: line.start.x + line.dir.x * u,
      z: line.start.z + line.dir.z * u,
      dir: line.dir,
    }))
  })

  const pillarParts = $derived.by((): PillarPart[] => {
    if (!support || supportSpots.length === 0) return []
    return buildPillarParts(support.type, supportSpots, wallSystem(doc.building.wallSystemId), floor?.datumHeight ?? 0)
  })

  $effect(() => {
    const parts = pillarParts
    return () => {
      for (const part of parts) part.geometry.dispose()
    }
  })

  function chooseSupport(next: string) {
    if (!floor || !wall) return
    if (next === 'none') {
      documentStore.setSupport(floor.id, wall.id, null)
      return
    }
    const type = next as SupportType
    documentStore.setSupport(floor.id, wall.id, support ? { ...support, type } : defaultSupport(type))
  }

  function setSupportSpacingMm(value: number) {
    if (!floor || !wall || !support || !Number.isFinite(value)) return
    const spacing = Math.min(SUPPORT_MAX_SPACING_M, Math.max(SUPPORT_MIN_SPACING_M, value / 1000))
    documentStore.setSupport(floor.id, wall.id, { ...support, spacing })
  }

  function chooseFence(next: string) {
    if (!floor || !wall) return
    if (next === 'none') {
      documentStore.setFence(floor.id, wall.id, null)
      return
    }
    documentStore.setFence(floor.id, wall.id, {
      type: next as FenceType,
      height: fence?.height ?? DEFAULT_FENCE_HEIGHT_M,
    })
  }

  function setFenceHeightMm(value: number) {
    if (!floor || !wall || !fence || !Number.isFinite(value)) return
    const height = Math.min(FENCE_MAX_HEIGHT_M, Math.max(FENCE_MIN_HEIGHT_M, value / 1000))
    documentStore.setFence(floor.id, wall.id, { ...fence, height })
  }

  const widthKind = $derived(editingOpening?.kind ?? insertTool)

  const widthLimits = $derived.by(() => {
    if (!frame) return null
    const base = openingWidthLimits(widthKind, frame.length)
    if (!editingOpening || !wall) return base
    const others = wall.openings.filter((opening) => opening.id !== editingOpening.id)
    const centre = editingOpening.u + editingOpening.width / 2
    const room = maxOpeningWidth(centre, frame.length, others, undefined, gap)
    return { min: base.min, max: Math.min(base.max, room) }
  })
  const widthAllowed = $derived(widthLimits !== null && widthLimits.max >= widthLimits.min - 1e-9)

  const shownWidth = $derived.by(() => {
    const fallback =
      preferredWidth[widthKind] ?? defaultOpeningDimensions(widthKind, system, doc.building.defaults).width
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
      const u = placeOpeningU(centre - shownWidth / 2, shownWidth, frame.length, others, undefined, gap)
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
    const _opening = selectedOpeningId
    widthDraft = null
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
    if (!locked || !orthoCamera || !frame || !viewFrame) return null
    const picked = canvasFromTarget(event.currentTarget)
    if (!picked) return null
    const offsetX = event.clientX - picked.rect.left
    const offsetY = event.clientY - picked.rect.top
    if (picked.rect.width <= 0 || picked.rect.height <= 0) return null
    configureOrthoCamera(orthoCamera, picked.rect.width / picked.rect.height, viewFrame)
    const uv = pointerToWallUv(
      orthoCamera,
      offsetX,
      offsetY,
      picked.rect.width,
      picked.rect.height,
      viewFrame,
    )
    if (!uv || side === 1) return uv
    return { u: frame.length - uv.u, v: uv.v }
  }

  function onViewportPointerDown(event: PointerEvent) {
    if (!locked || !floor || !wall || !frame || logical) return
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
    const placed = placeSnappedOpeningU(uv.u - shownWidth / 2, shownWidth, frame.length, wall.openings, min, system)
    if (placed === null) return
    selectAdded(documentStore.addOpening(floor.id, wall.id, insertTool, placed.u, placed.width))
  }

  function onWidthInput(value: number) {
    if (editingOpening) widthDraft = value
    else preferredWidth[insertTool] = value
  }

  function commitWidth(value: number) {
    widthDraft = null
    const snapped = snapOpeningWidth(value, openingMinWidth(widthKind), system)
    if (!editingOpening || !floor || !wall) {
      preferredWidth[insertTool] = snapped
      return
    }
    const others = wall.openings.filter((opening) => opening.id !== editingOpening.id)
    const centre = editingOpening.u + editingOpening.width / 2
    const u = frame
      ? snapLegalModuleU(centre - snapped / 2, snapped, frame.length, others, system)
      : null
    documentStore.updateOpening(floor.id, wall.id, editingOpening.id, {
      width: snapped,
      ...(u === null ? {} : { u }),
    })
  }

  function chooseSystem(id: WallSystemId) {
    if (!floor || !wall || id === system.id) return
    preferredWidth = {}
    documentStore.setWallSystem(floor.id, wall.id, id)
  }

  function removeSelected() {
    if (!floor || !wall || !selectedOpeningId) return
    documentStore.removeOpening(floor.id, wall.id, selectedOpeningId)
    onSelectOpening?.(null)
  }

  function chooseInsert(tool: OpeningKind) {
    insertTool = tool
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
    if (logical) {
      if (!fence && !support) {
        return {
          text: 'A logical wall marks a line without building it. Choose a fence or supports to build along it.',
          error: false,
        }
      }
      const parts: string[] = []
      if (support) {
        const count = supportSpots.length
        parts.push(`${supportSpec(support.type).name}s at up to ${mm(support.spacing)} mm centres: ${count} over ${frame.length.toFixed(2)} m.`)
      }
      if (fence) {
        const spec = fenceSpec(fence.type)
        const posts = fencePosts(frame.length, spec).length
        parts.push(`${spec.name}, ${mm(fence.height)} mm high: ${posts} posts.`)
      }
      return { text: parts.join(' '), error: false }
    }
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
      const shownU = side === -1 && frame ? frame.length - readout.u : readout.u
      const parts = [`u ${mm(shownU)} mm`, `v ${mm(readout.v)} mm`]
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
    const u = placeOpeningU(uv.u - current.grabU, moving.width, frame.length, others, undefined, gap)
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
        const u = snapLegalModuleU(current.u, moving.width, frame.length, others, system)
        if (u !== null) {
          const moved =
            u !== current.originU || (!current.aligned && current.v !== current.originV)
          if (moved) {
            if (current.aligned) {
              documentStore.updateOpening(floor.id, wall.id, current.id, { u })
            } else {
              const vertical = snapOpeningVertical(current.v, moving.height, frame.height, system)
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
    {#if logical}
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background px-3 py-1.5 text-sm">
        <div class="flex min-w-0 items-center gap-2">
          <span class="text-muted-foreground">Fence</span>
          <Select.Root type="single" value={fence?.type ?? 'none'} onValueChange={chooseFence}>
            <Select.Trigger size="sm" class="w-36 sm:w-44" aria-label="Fence">
              {fence ? fenceSpec(fence.type).name : 'None'}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="none">None</Select.Item>
              {#each FENCES as option (option.id)}
                <Select.Item value={option.id} label={option.name}>
                  <div class="grid max-w-64 gap-0.5 whitespace-normal">
                    <span>{option.name}</span>
                    <span class="text-xs text-muted-foreground">{option.text}</span>
                  </div>
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        {#if fence}
          <Separator orientation="vertical" class="hidden h-5 sm:block" />
          <label class="flex items-center gap-2">
            <span class="text-muted-foreground">Height</span>
            <Input
              class="h-7 w-20"
              type="number"
              min={mm(FENCE_MIN_HEIGHT_M)}
              max={mm(FENCE_MAX_HEIGHT_M)}
              step="100"
              value={mm(fence.height)}
              onchange={(event) => setFenceHeightMm(Number(event.currentTarget.value))}
            />
            <span class="text-muted-foreground">mm</span>
          </label>
        {/if}
        <Separator orientation="vertical" class="hidden h-5 sm:block" />
        <div class="flex min-w-0 items-center gap-2">
          <span class="text-muted-foreground">Supports</span>
          <Select.Root type="single" value={support?.type ?? 'none'} onValueChange={chooseSupport}>
            <Select.Trigger size="sm" class="w-36 sm:w-44" aria-label="Supports">
              {support ? supportSpec(support.type).name : 'None'}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="none">None</Select.Item>
              {#each SUPPORTS as option (option.id)}
                <Select.Item value={option.id} label={option.name}>
                  <div class="grid max-w-64 gap-0.5 whitespace-normal">
                    <span>{option.name}</span>
                    <span class="text-xs text-muted-foreground">{option.text}</span>
                  </div>
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        {#if support}
          <label class="flex items-center gap-2">
            <span class="text-muted-foreground">Spacing</span>
            <Input
              class="h-7 w-20"
              type="number"
              min={mm(SUPPORT_MIN_SPACING_M)}
              max={mm(SUPPORT_MAX_SPACING_M)}
              step="100"
              value={mm(support.spacing)}
              onchange={(event) => setSupportSpacingMm(Number(event.currentTarget.value))}
            />
            <span class="text-muted-foreground">mm</span>
          </label>
        {/if}
      </div>
    {:else}
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background px-3 py-1.5 text-sm">
      <div class="flex items-center gap-2">
        <span class="text-muted-foreground">Place</span>
        <Select.Root type="single" value={insertTool} onValueChange={(next) => chooseInsert(next as OpeningKind)}>
          <Select.Trigger size="sm" class="w-32 sm:w-40" aria-label="Opening to place">
            {insertChoices.find((choice) => choice.kind === insertTool)?.label}
          </Select.Trigger>
          <Select.Content>
            {#each insertChoices as choice (choice.kind)}
              <Select.Item value={choice.kind}>{choice.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      {#if widthLimits && widthAllowed}
        <Separator orientation="vertical" class="hidden h-5 sm:block" />
        <label class="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <span class="shrink-0 text-muted-foreground">{editingOpening ? 'Width' : 'New width'}</span>
          <input
            class="min-w-0 flex-1 accent-primary sm:w-32 sm:flex-none"
            type="range"
            min={widthLimits.min}
            max={widthLimits.max}
            step="0.01"
            value={shownWidth}
            oninput={(event) => onWidthInput(Number(event.currentTarget.value))}
            onchange={(event) => commitWidth(Number(event.currentTarget.value))}
          />
          <Input
            class="h-7 w-20"
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
          <span class="text-muted-foreground">mm</span>
        </label>
      {/if}
      {#if editingOpening}
        <Button variant="destructive" size="sm" onclick={removeSelected}>Remove opening</Button>
      {/if}
      <div class="flex w-full min-w-0 items-center gap-2 sm:ml-auto sm:w-auto">
        <span class="text-muted-foreground">Wall</span>
        <Select.Root type="single" value={system.id} onValueChange={(next) => chooseSystem(next as WallSystemId)}>
          <Select.Trigger size="sm" class="w-full sm:w-48" aria-label="Wall system">{system.name}</Select.Trigger>
          <Select.Content>
            {#each WALL_SYSTEMS as choice (choice.id)}
              <Select.Item value={choice.id}>{choice.name}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
    </div>
    {/if}
    <div class="scene">
      <div class="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" class="shadow-xs" onclick={() => (locked = !locked)}>
          {locked ? 'Perspective' : 'Fixed view'}
        </Button>
        {#if viewFace && farFace}
          <Button
            variant="outline"
            size="sm"
            class="shadow-xs"
            title="Look at the other face of this wall (F)"
            onclick={flipSide}
          >
            <span class="text-muted-foreground">From</span>
            {viewFace.label}
            <ArrowLeftRight class="text-muted-foreground" />
            <span class="text-muted-foreground">{farFace.label}</span>
          </Button>
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
        frame={viewFrame ?? frame}
        wallGeometries={wallModel.blocks}
        courseGeometries={wallModel.courses}
        lintelGeometry={wallModel.lintel}
        frameGeometry={wallModel.frame}
        glassGeometry={wallModel.glass}
        panelMeshes={wallModel.panels}
        fenceParts={[...fenceParts, ...pillarParts.map((part) => ({ ...part, opacity: 1 }))]}
        {orthoCamera}
        {onOrthoCamera}
      />
      {#if locked && displayWall}
        <ElevationDimensions
          length={frame.length}
          height={frame.height}
          head={logical ? Math.max(fence?.height ?? 0, support ? SUPPORT_HEIGHT_M : 0) : WALL_HEAD}
          openings={logical ? [] : shownOpenings(displayWall.openings)}
          selectedId={selectedOpeningId}
          floorLevel={floor?.index === 0 && !logical ? SURFACE_BED_TOP_ABOVE_DATUM_M : null}
        />
      {/if}
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

  .scene {
    position: relative;
    display: flex;
    flex: 1;
    min-height: 0;
    width: 100%;
  }

  .viewport {
    position: relative;
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
