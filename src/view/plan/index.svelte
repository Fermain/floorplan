<script lang="ts">
  import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
  import { solidWallPolygons, type SvgPoint } from '../../lib/export/svg'
  import { cornerById } from '../../lib/model/geom'
  import { deriveRooms } from '../../lib/model/rooms'
  import type { Floor, WallSkin } from '../../lib/model/types'
  import { pointInPlot, segmentAllowedInPlot } from '../../lib/model/plot-check'
  import { documentStore } from '../../lib/state/document.svelte'
  import {
    nearestCorner,
    nearestWallPoint,
    snapEndToModule,
    snapEndToMinTurn,
    CORNER_SNAP_M,
    MIN_TURN_DEG,
    headingFromNorthDeg,
    smallerAngleDeg,
  } from './snap'

  type Tool = 'draw-double' | 'draw-logical' | 'select' | 'finish'

  const PLOT_MARGIN_M = 1
  const WALL_HIT_M = 0.12
  const CORNER_MATCH_M = 0.002

  type PendingDraw = {
    startCornerId?: string
    startPoint?: { x: number; z: number }
  }

  let {
    selectedWallId = $bindable<string | null>(null),
    activeFloorId = $bindable(''),
  }: {
    selectedWallId?: string | null
    activeFloorId?: string
  } = $props()

  let tool = $state<Tool>('select')
  let pendingDraw = $state<PendingDraw | null>(null)
  let chainOriginId = $state<string | null>(null)
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

  function explain(reason: string): string {
    if (reason === 'wall outside plot') return 'That wall leaves the plot. Click an end inside the outline.'
    if (reason === 'degenerate wall') return 'The end is too close to the start.'
    return reason
  }

  function applyResult(result: { ok: boolean; reason?: string }) {
    if (result.ok) {
      errorMessage = null
      return true
    }
    errorMessage = explain(result.reason ?? 'action failed')
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

    const resolved = resolveEnd(floor, start, startId, endX, endZ)
    const endCornerHit = resolved.cornerId
      ? floor.corners.find((c) => c.id === resolved.cornerId)
      : undefined
    let endId = endCornerHit?.id
    const endPoint = { x: resolved.x, z: resolved.z }

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
    const origin = chainOriginId ?? startId
    if (chainOriginId && endId === chainOriginId) {
      pendingDraw = null
      chainOriginId = null
      pointerPlan = null
      return
    }
    chainOriginId = origin
    const placed = documentStore.document.building.floors.find((f) => f.id === activeFloorId)
    const endCorner = placed ? cornerById(placed.corners, endId) : undefined
    pendingDraw = { startCornerId: endId }
    if (endCorner) pointerPlan = { x: endCorner.x, z: endCorner.z }
  }

  function cancelDraw() {
    if (!pendingDraw) return
    pendingDraw = null
    chainOriginId = null
    pointerPlan = null
    errorMessage = null
  }

  function onPlanContextMenu(event: MouseEvent) {
    event.preventDefault()
    cancelDraw()
  }

  function onSvgPointerDown(event: PointerEvent) {
    if (event.button === 2 || (event.ctrlKey && !event.metaKey)) {
      cancelDraw()
      return
    }
    if (event.button !== 0) return
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
      const wallHit = hit
        ? undefined
        : nearestWallPoint(activeFloor.corners, activeFloor.walls, plan.x, plan.z)
      if (!hit && !wallHit && !pointInPlot(document.plot, plan.x, plan.z)) {
          errorMessage = 'Click inside the plot to start a wall.'
          return
        }
        pendingDraw = hit
          ? { startCornerId: hit.id }
          : { startPoint: { x: wallHit?.x ?? plan.x, z: wallHit?.z ?? plan.z } }
        pointerPlan = plan
        errorMessage = null
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

  $effect(() => {
    const drawing = pendingDraw
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !drawing) return
      event.preventDefault()
      cancelDraw()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function setTool(next: Tool) {
    tool = next
    pendingDraw = null
    chainOriginId = null
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

  function referenceAway(
    floor: Floor,
    cornerId: string | undefined,
    start: { x: number; z: number },
    dx: number,
    dz: number,
  ): { dx: number; dz: number } | null {
    if (!cornerId) return null
    let best: { dx: number; dz: number; deg: number } | null = null
    for (const wall of floor.walls) {
      const atStart = wall.startCornerId === cornerId
      const atEnd = wall.endCornerId === cornerId
      if (!atStart && !atEnd) continue
      const other = cornerById(floor.corners, atStart ? wall.endCornerId : wall.startCornerId)
      if (!other) continue
      const wx = other.x - start.x
      const wz = other.z - start.z
      const deg = smallerAngleDeg(wx, wz, dx, dz)
      if (deg === null) continue
      if (!best || deg < best.deg) best = { dx: wx, dz: wz, deg }
    }
    return best ? { dx: best.dx, dz: best.dz } : null
  }

  function resolveEnd(
    floor: Floor,
    start: { x: number; z: number },
    startCornerId: string | undefined,
    x: number,
    z: number,
  ): { x: number; z: number; cornerId?: string; wallSnap: boolean; minTurn: boolean } {
    const hit = nearestCorner(floor.corners, x, z, CORNER_SNAP_M, startCornerId)
    if (hit) return { x: hit.x, z: hit.z, cornerId: hit.id, wallSnap: false, minTurn: false }
    const wallHit = nearestWallPoint(floor.corners, floor.walls, x, z, CORNER_SNAP_M, startCornerId)
    if (wallHit) return { x: wallHit.x, z: wallHit.z, wallSnap: true, minTurn: false }
    let end = { x, z }
    let minTurn = false
    const ref = referenceAway(floor, startCornerId, start, x - start.x, z - start.z)
    if (ref) {
      const turned = snapEndToMinTurn(document.plot, start.x, start.z, end.x, end.z, ref.dx, ref.dz)
      end = turned
      minTurn = turned.applied
    }
    const snapped = snapEndToModule(document.plot, start.x, start.z, end.x, end.z, false)
    return { x: snapped.x, z: snapped.z, wallSnap: false, minTurn }
  }

  function angleReadout(
    floor: Floor,
    startCornerId: string | undefined,
    start: { x: number; z: number },
    dx: number,
    dz: number,
    length: number,
  ): { label: string; path: string | null; x: number; z: number } | null {
    if (length <= 0.05) return null
    const ref = referenceAway(floor, startCornerId, start, dx, dz)
    if (ref) {
      const deg = smallerAngleDeg(ref.dx, ref.dz, dx, dz)
      if (deg === null) return null
      const a0 = Math.atan2(ref.dz, ref.dx)
      const a1 = Math.atan2(dz, dx)
      let delta = a1 - a0
      while (delta > Math.PI) delta -= 2 * Math.PI
      while (delta < -Math.PI) delta += 2 * Math.PI
      const mid = a0 + delta / 2
      return {
        label: `${Math.round(deg)}°`,
        path: arcPath(start.x, start.z, 0.75, a0, delta),
        x: start.x + Math.cos(mid) * 1.15,
        z: start.z + Math.sin(mid) * 1.15,
      }
    }
    const heading = headingFromNorthDeg(dx, dz)
    if (heading === null) return null
    const len = Math.hypot(dx, dz)
    return {
      label: `${Math.round(heading)}° from N`,
      path: null,
      x: start.x + (dx / len) * 0.9 + (-dz / len) * 0.55,
      z: start.z + (dz / len) * 0.9 + (dx / len) * 0.55,
    }
  }

  function arcPath(cx: number, cz: number, radius: number, a0: number, delta: number): string | null {
    if (Math.abs(delta) < 0.02) return null
    const steps = 12
    let d = ''
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (delta * i) / steps
      const x = cx + radius * Math.cos(a)
      const z = cz + radius * Math.sin(a)
      d += `${i === 0 ? 'M' : 'L'}${fmt(x)} ${fmt(z)} `
    }
    return d.trim()
  }

  const previewLine = $derived.by(() => {
    if (!pendingDraw || !pointerPlan || !activeFloor) return null
    const start = startCoords(activeFloor, pendingDraw)
    if (!start) return null
    const resolved = resolveEnd(activeFloor, start, pendingDraw.startCornerId, pointerPlan.x, pointerPlan.z)
    const dx = resolved.x - start.x
    const dz = resolved.z - start.z
    const length = Math.hypot(dx, dz)
    const allowed =
      length <= 0.05 ||
      segmentAllowedInPlot(document.plot, start.x, start.z, resolved.x, resolved.z)
    return {
      x1: start.x,
      z1: start.z,
      x2: resolved.x,
      z2: resolved.z,
      length,
      allowed,
      cornerId: resolved.cornerId,
      wallSnap: resolved.wallSnap,
      minTurn: resolved.minTurn,
      angle: angleReadout(activeFloor, pendingDraw.startCornerId, start, dx, dz, length),
    }
  })

  const hoveredCorner = $derived.by(() => {
    if (!pointerPlan || !activeFloor) return undefined
    return nearestCorner(
      activeFloor.corners,
      pointerPlan.x,
      pointerPlan.z,
      CORNER_SNAP_M,
      pendingDraw?.startCornerId,
    )
  })

  const hoveredWall = $derived.by(() => {
    if (!pointerPlan || !activeFloor || hoveredCorner) return undefined
    if (tool !== 'draw-double' && tool !== 'draw-logical') return undefined
    return nearestWallPoint(
      activeFloor.corners,
      activeFloor.walls,
      pointerPlan.x,
      pointerPlan.z,
      CORNER_SNAP_M,
      pendingDraw?.startCornerId,
    )
  })

  const drawHint = $derived.by(() => {
    if (tool !== 'draw-double' && tool !== 'draw-logical') return ''
    if (!previewLine) return 'Click inside the plot to start a wall, then click each corner. Right-click or Escape stops.'
    if (previewLine.length <= 0.05) return 'Click the next corner. Right-click or Escape stops.'
    const angle = previewLine.angle ? `, ${previewLine.angle.label}` : ''
    if (!previewLine.allowed) return `That end leaves the plot. ${previewLine.length.toFixed(2)} m${angle}`
    const snap = previewLine.cornerId
      ? ' Snaps to the corner.'
      : previewLine.wallSnap
        ? ' Snaps to the wall.'
        : previewLine.minTurn
          ? ` Minimum angle is ${MIN_TURN_DEG}°.`
          : ''
    return `Click to place the end, ${previewLine.length.toFixed(2)} m${angle}.${snap} Right-click or Escape stops.`
  })

  function roomFill(finishId: string): string {
    if (finishId === 'timber') return 'rgba(139, 90, 43, 0.12)'
    return 'rgba(120, 120, 120, 0.08)'
  }
</script>

<div class="root" oncontextmenu={onPlanContextMenu}>
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
    {:else if drawHint}
      <p class="hint">{drawHint}</p>
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
    <rect
      x={bounds.minX}
      y={bounds.minZ}
      width={bounds.maxX - bounds.minX}
      height={bounds.maxZ - bounds.minZ}
      fill="transparent"
      pointer-events="all"
    />
    <polygon
      points={pointsAttr(plotRing.map(([x, z]) => [x, z] as SvgPoint))}
      fill="#e7e5e4"
      stroke="#18181b"
      stroke-width="0.06"
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
        <circle
          cx={previewLine.x1}
          cy={previewLine.z1}
          r="0.18"
          fill="#2563eb"
          pointer-events="none"
        />
        <line
          x1={previewLine.x1}
          y1={previewLine.z1}
          x2={previewLine.x2}
          y2={previewLine.z2}
          stroke={previewLine.allowed ? '#2563eb' : '#b91c1c'}
          stroke-width="0.04"
          stroke-dasharray="0.15 0.1"
          pointer-events="none"
        />
        {#if previewLine.angle?.path}
          <path
            d={previewLine.angle.path}
            fill="none"
            stroke="#2563eb"
            stroke-width="0.03"
            pointer-events="none"
          />
        {/if}
        {#if previewLine.angle}
          <text
            x={previewLine.angle.x}
            y={previewLine.angle.z}
            fill="#1d4ed8"
            font-size="0.42"
            text-anchor="middle"
            dominant-baseline="middle"
            pointer-events="none"
          >
            {previewLine.angle.label}
          </text>
        {/if}
      {/if}
      {#each activeFloor.corners as corner (corner.id)}
        <circle
          cx={corner.x}
          cy={corner.z}
          r={hoveredCorner?.id === corner.id ? 0.28 : 0.16}
          fill={hoveredCorner?.id === corner.id ? '#2563eb' : '#18181b'}
          pointer-events="none"
        />
      {/each}
      {#if previewLine?.wallSnap}
        <circle
          cx={previewLine.x2}
          cy={previewLine.z2}
          r="0.22"
          fill="none"
          stroke="#2563eb"
          stroke-width="0.045"
          pointer-events="none"
        />
      {:else if hoveredWall}
        <circle
          cx={hoveredWall.x}
          cy={hoveredWall.z}
          r="0.22"
          fill="none"
          stroke="#2563eb"
          stroke-width="0.045"
          pointer-events="none"
        />
      {/if}
      {#if (tool === 'draw-double' || tool === 'draw-logical') && pointerPlan}
        <circle
          cx={pointerPlan.x}
          cy={pointerPlan.z}
          r={CORNER_SNAP_M}
          fill="none"
          stroke="#93c5fd"
          stroke-width="0.025"
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
    min-height: 0;
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

  .error,
  .hint {
    margin: 0;
    flex: 1 1 100%;
  }

  .error {
    color: #b91c1c;
  }

  .hint {
    color: #3f3f46;
  }

  .canvas {
    flex: 1;
    width: 100%;
    min-height: 0;
    touch-action: none;
    cursor: crosshair;
  }

</style>
