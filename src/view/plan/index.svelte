<script lang="ts">
  import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
  import { solidWallPolygons, type SvgPoint } from '../../lib/export/svg'
  import { cornerById } from '../../lib/model/geom'
  import { deriveRooms } from '../../lib/model/rooms'
  import type { Floor, WallSkin } from '../../lib/model/types'
  import { documentStore } from '../../lib/state/document.svelte'
  import { nearestCorner, snapEndToModule } from './snap'

  type Tool = 'draw-double' | 'draw-logical' | 'select' | 'finish'

  const PLOT_MARGIN_M = 1
  const WALL_HIT_M = 0.12
  const CORNER_MATCH_M = 0.002

  type PendingDraw = {
    startCornerId?: string
    startPoint?: { x: number; z: number }
  }

  let tool = $state<Tool>('select')
  let activeFloorId = $state(documentStore.document.building.floors[0]?.id ?? '')
  let selectedWallId = $state<string | null>(null)
  let pendingDraw = $state<PendingDraw | null>(null)
  let errorMessage = $state<string | null>(null)
  let pointerPlan = $state<{ x: number; z: number } | null>(null)
  let svgEl = $state<SVGSVGElement | undefined>(undefined)

  $effect(() => {
    const floors = documentStore.document.building.floors
    if (floors.length === 0) return
    if (!floors.some((f) => f.id === activeFloorId)) {
      activeFloorId = floors[0].id
    }
  })

  const document = $derived(documentStore.document)
  const plotRing = $derived(document.plot.ring)
  const floors = $derived(document.building.floors)
  const activeFloor = $derived(floors.find((f) => f.id === activeFloorId))

  const bounds = $derived(plotBounds(plotRing, PLOT_MARGIN_M))
  const viewBox = $derived(
    `${bounds.minX} ${bounds.minZ} ${bounds.maxX - bounds.minX} ${bounds.maxZ - bounds.minZ}`,
  )

  const wallPolygons = $derived(
    activeFloor ? solidWallPolygons(document, activeFloorId) : [],
  )
  const rooms = $derived(activeFloor ? deriveRooms(activeFloor) : [])
  const logicalWalls = $derived(activeFloor?.walls.filter((w) => w.skin === 'logical') ?? [])

  function plotBounds(ring: [number, number][], margin: number) {
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (const [x, z] of ring) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minZ = Math.min(minZ, z)
      maxZ = Math.max(maxZ, z)
    }
    return {
      minX: minX - margin,
      maxX: maxX + margin,
      minZ: minZ - margin,
      maxZ: maxZ + margin,
    }
  }

  function fmt(n: number): string {
    const r = Math.round(n * 1000) / 1000
    return Number.isInteger(r) ? String(r) : String(r)
  }

  function pointsAttr(points: SvgPoint[]): string {
    return points.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ')
  }

  function roomPolygonPoints(cornerIds: string[], floor: Floor): SvgPoint[] {
    return cornerIds
      .map((id) => cornerById(floor.corners, id))
      .filter((c): c is NonNullable<typeof c> => c !== undefined)
      .map((c) => [c.x, c.z] as SvgPoint)
  }

  function clientToPlan(svg: SVGSVGElement, clientX: number, clientY: number) {
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const local = pt.matrixTransform(ctm.inverse())
    return { x: local.x, z: local.y }
  }

  function distToSegment(
    px: number,
    pz: number,
    ax: number,
    az: number,
    bx: number,
    bz: number,
  ): number {
    const dx = bx - ax
    const dz = bz - az
    const lenSq = dx * dx + dz * dz
    if (lenSq === 0) return Math.hypot(px - ax, pz - az)
    let t = ((px - ax) * dx + (pz - az) * dz) / lenSq
    t = Math.max(0, Math.min(1, t))
    const qx = ax + t * dx
    const qz = az + t * dz
    return Math.hypot(px - qx, pz - qz)
  }

  function pickWall(floor: Floor, x: number, z: number): string | null {
    let bestId: string | null = null
    let bestD = WALL_HIT_M
    for (const wall of floor.walls) {
      const a = cornerById(floor.corners, wall.startCornerId)
      const b = cornerById(floor.corners, wall.endCornerId)
      if (!a || !b) continue
      const d = distToSegment(x, z, a.x, a.z, b.x, b.z)
      if (d < bestD) {
        bestD = d
        bestId = wall.id
      }
    }
    return bestId
  }

  function roomAtPoint(floor: Floor, x: number, z: number) {
    const derived = deriveRooms(floor)
    let best: (typeof derived)[0] | null = null
    for (const room of derived) {
      const ring = roomPolygonPoints(room.cornerIds, floor)
      if (ring.length < 3) continue
      const closed = [...ring, ring[0]]
      const poly = {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'Polygon' as const,
          coordinates: [closed.map(([px, pz]) => [px, pz])],
        },
      }
      const pt = {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'Point' as const, coordinates: [x, z] },
      }
      if (!booleanPointInPolygon(pt, poly)) continue
      if (!best || room.signedArea < best.signedArea) {
        best = room
      }
    }
    return best
  }

  function cornerIdAt(floor: Floor, x: number, z: number): string | undefined {
    return floor.corners.find((c) => Math.hypot(c.x - x, c.z - z) <= CORNER_MATCH_M)?.id
  }

  function applyResult(result: { ok: boolean; reason?: string }) {
    if (result.ok) {
      errorMessage = null
      return true
    }
    errorMessage = result.reason ?? 'action failed'
    return false
  }

  function startCoords(floor: Floor, pending: PendingDraw): { x: number; z: number } | null {
    if (pending.startCornerId) {
      const c = cornerById(floor.corners, pending.startCornerId)
      return c ? { x: c.x, z: c.z } : null
    }
    return pending.startPoint ?? null
  }

  function finishDraw(endX: number, endZ: number, skin: WallSkin) {
    const floor = activeFloor
    if (!floor || !pendingDraw) return
    const pending = pendingDraw
    let cornerUndos = 0
    const rollbackCorners = () => {
      for (let i = 0; i < cornerUndos; i++) documentStore.undo()
      cornerUndos = 0
    }
    let startId = pending.startCornerId
    const start = startCoords(floor, pending)

    if (!start) {
      pendingDraw = null
      return
    }

    const endCornerHit = nearestCorner(floor.corners, endX, endZ)
    let endId = endCornerHit?.id
    let endPoint = endCornerHit
      ? { x: endCornerHit.x, z: endCornerHit.z }
      : { x: endX, z: endZ }
    if (!endCornerHit) {
      endPoint = snapEndToModule(document.plot, start.x, start.z, endPoint.x, endPoint.z, false)
    }

    if (!startId) {
      const r = documentStore.addCorner(activeFloorId, pending.startPoint!.x, pending.startPoint!.z)
      if (!applyResult(r)) return
      cornerUndos += 1
      const updated = documentStore.document.building.floors.find((f) => f.id === activeFloorId)!
      startId = cornerIdAt(updated, pending.startPoint!.x, pending.startPoint!.z)
      if (!startId) {
        rollbackCorners()
        errorMessage = 'corner not found'
        return
      }
      const movedStart = cornerById(updated.corners, startId)!
      start.x = movedStart.x
      start.z = movedStart.z
    }

    if (!endId) {
      const r = documentStore.addCorner(activeFloorId, endPoint.x, endPoint.z)
      if (!applyResult(r)) {
        rollbackCorners()
        return
      }
      cornerUndos += 1
      const updated = documentStore.document.building.floors.find((f) => f.id === activeFloorId)!
      endId = cornerIdAt(updated, endPoint.x, endPoint.z)
      if (!endId) {
        rollbackCorners()
        errorMessage = 'corner not found'
        return
      }
    }

    const wallResult = documentStore.addWall(activeFloorId, startId, endId, skin)
    if (!applyResult(wallResult)) {
      rollbackCorners()
      return
    }
    pendingDraw = null
    pointerPlan = null
  }

  function onSvgPointerDown(event: PointerEvent) {
    const svg = svgEl
    if (!svg || !activeFloor) return
    const plan = clientToPlan(svg, event.clientX, event.clientY)
    if (!plan) return

    if (tool === 'select') {
      const id = pickWall(activeFloor, plan.x, plan.z)
      selectedWallId = id
      if (id) applyResult({ ok: true })
      return
    }

    if (tool === 'finish') {
      const room = roomAtPoint(activeFloor, plan.x, plan.z)
      if (!room) return
      const next = room.finishId === 'timber' ? 'unfinished' : 'timber'
      applyResult(documentStore.setRoomFinish(activeFloorId, room.cornerIds, next))
      return
    }

    if (tool === 'draw-double' || tool === 'draw-logical') {
      const skin: WallSkin = tool === 'draw-logical' ? 'logical' : 'double'
      if (!pendingDraw) {
        const hit = nearestCorner(activeFloor.corners, plan.x, plan.z)
        pendingDraw = hit ? { startCornerId: hit.id } : { startPoint: { x: plan.x, z: plan.z } }
        pointerPlan = plan
        applyResult({ ok: true })
        return
      }
      finishDraw(plan.x, plan.z, skin)
    }
  }

  function onSvgPointerMove(event: PointerEvent) {
    const svg = svgEl
    if (!svg) return
    pointerPlan = clientToPlan(svg, event.clientX, event.clientY)
  }

  function setTool(next: Tool) {
    tool = next
    pendingDraw = null
  }

  function selectFloor(id: string) {
    activeFloorId = id
    pendingDraw = null
    selectedWallId = null
  }

  function addFloor() {
    const r = documentStore.addFloor()
    if (applyResult(r)) {
      const added = documentStore.document.building.floors.at(-1)
      if (added) activeFloorId = added.id
    }
  }

  function removeFloor(id: string) {
    if (floors.length <= 1) return
    const r = documentStore.removeFloor(id)
    if (applyResult(r) && activeFloorId === id) {
      activeFloorId = documentStore.document.building.floors[0].id
    }
  }

  const previewLine = $derived.by(() => {
    if (!pendingDraw || !pointerPlan || !activeFloor) return null
    const start = startCoords(activeFloor, pendingDraw)
    if (!start) return null
    return { x1: start.x, z1: start.z, x2: pointerPlan.x, z2: pointerPlan.z }
  })

  function roomFill(finishId: string): string {
    if (finishId === 'timber') return 'rgba(139, 90, 43, 0.12)'
    return 'rgba(120, 120, 120, 0.08)'
  }
</script>

<div class="root">
  <div class="bar">
    <div class="tools">
      <button type="button" class:active={tool === 'draw-double'} onclick={() => setTool('draw-double')}>
        Draw wall
      </button>
      <button type="button" class:active={tool === 'draw-logical'} onclick={() => setTool('draw-logical')}>
        Logical wall
      </button>
      <button type="button" class:active={tool === 'select'} onclick={() => setTool('select')}>Select</button>
      <button type="button" class:active={tool === 'finish'} onclick={() => setTool('finish')}>Finish</button>
    </div>
    <div class="floors">
      {#each floors as floor (floor.id)}
        <button
          type="button"
          class:active={floor.id === activeFloorId}
          onclick={() => selectFloor(floor.id)}
        >
          Floor {floor.index + 1}
        </button>
      {/each}
      <button type="button" onclick={addFloor}>+ Floor</button>
      {#if floors.length > 1 && activeFloor}
        <button type="button" onclick={() => removeFloor(activeFloorId)}>Remove floor</button>
      {/if}
    </div>
    {#if errorMessage}
      <p class="error">{errorMessage}</p>
    {/if}
  </div>
  <svg
    bind:this={svgEl}
    class="canvas"
    {viewBox}
    preserveAspectRatio="xMidYMid meet"
    onpointerdown={onSvgPointerDown}
    onpointermove={onSvgPointerMove}
  >
    <polyline
      points={pointsAttr([...plotRing.map(([x, z]) => [x, z] as SvgPoint), [plotRing[0][0], plotRing[0][1]]])}
      fill="none"
      stroke="#000"
      stroke-width="0.05"
    />
    {#if activeFloor}
      {#each rooms as room (room.cornerIds.join(','))}
        {@const pts = roomPolygonPoints(room.cornerIds, activeFloor)}
        {#if pts.length >= 3}
          <polygon
            points={pointsAttr(pts)}
            fill={roomFill(room.finishId)}
            stroke="none"
            pointer-events={tool === 'finish' ? 'fill' : 'none'}
            onpointerdown={(e) => {
              if (tool !== 'finish') return
              e.stopPropagation()
              const next = room.finishId === 'timber' ? 'unfinished' : 'timber'
              applyResult(documentStore.setRoomFinish(activeFloorId, room.cornerIds, next))
            }}
          />
        {/if}
      {/each}
      {#each wallPolygons as poly, i (i)}
        <polygon points={pointsAttr(poly)} fill="#333" stroke="none" />
      {/each}
      {#each logicalWalls as wall (wall.id)}
        {@const a = cornerById(activeFloor.corners, wall.startCornerId)}
        {@const b = cornerById(activeFloor.corners, wall.endCornerId)}
        {#if a && b}
          <line
            x1={a.x}
            y1={a.z}
            x2={b.x}
            y2={b.z}
            stroke="#666"
            stroke-width="0.02"
            stroke-dasharray="0.2 0.15"
          />
        {/if}
      {/each}
      {#each activeFloor.walls as wall (wall.id)}
        {@const a = cornerById(activeFloor.corners, wall.startCornerId)}
        {@const b = cornerById(activeFloor.corners, wall.endCornerId)}
        {#if a && b}
          <line
            x1={a.x}
            y1={a.z}
            x2={b.x}
            y2={b.z}
            stroke={wall.id === selectedWallId ? '#2563eb' : 'transparent'}
            stroke-width={wall.id === selectedWallId ? 0.08 : 0.14}
            stroke-linecap="round"
            pointer-events={tool === 'select' ? 'stroke' : 'none'}
            onpointerdown={(e) => {
              if (tool !== 'select') return
              e.stopPropagation()
              selectedWallId = wall.id
              applyResult({ ok: true })
            }}
          />
        {/if}
      {/each}
      {#if previewLine}
        <line
          x1={previewLine.x1}
          y1={previewLine.z1}
          x2={previewLine.x2}
          y2={previewLine.z2}
          stroke="#2563eb"
          stroke-width="0.03"
          stroke-dasharray="0.15 0.1"
          pointer-events="none"
        />
      {/if}
    {/if}
  </svg>
</div>

<style>
  .root {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 100vh;
    background: #f4f4f5;
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1rem;
    padding: 0.5rem 0.75rem;
    background: #fff;
    border-bottom: 1px solid #e4e4e7;
    font-family: system-ui, sans-serif;
    font-size: 0.875rem;
  }

  .tools,
  .floors {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  button {
    padding: 0.35rem 0.65rem;
    border: 1px solid #d4d4d8;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
  }

  button.active {
    border-color: #2563eb;
    background: #eff6ff;
  }

  .error {
    margin: 0;
    color: #b91c1c;
    flex: 1 1 100%;
  }

  .canvas {
    flex: 1;
    width: 100%;
    min-height: 0;
    touch-action: none;
    cursor: crosshair;
  }

</style>
