<script lang="ts">
  import { pointsAttr } from '../svg'
  import type { SvgPoint } from '../../../lib/export/svg'
  import type { Document, Carport, PavingSurface } from '../../../lib/model/types'
  import type { Tool, PlanScope } from '../scope'
  import { retainingSpec } from '../../../lib/model/retaining'
  import { retainingSamples, type groundOf } from '../../../lib/geometry/retaining'
  import { carportRing, carportRoofSpec, carportPosts } from '../../../lib/model/carports'
  import { apronPolygons, PAVING } from '../../../lib/geometry/paving'
  import { projectDefaults } from '../../../lib/model/defaults'
  import { bedMaterialSpec } from '../../../lib/model/beds'
  import { insetRing, BED_SOIL_COLOUR } from '../../../lib/geometry/beds'

  interface Props {
    planScope: PlanScope
    document: Document
    planGround: ReturnType<typeof groundOf> | null
    selectedRetaining: string | null
    retainingPreview: [number, number][]
    retainingDraft: { x: number; z: number }[]
    retainingGuide: { point: { x: number; z: number } } | null
    tool: Tool
    selectedCarport: string | null
    carportMove: { id: string; preview: Carport | null; problem: string | null } | null
    carportGhost: { carport: Omit<Carport, 'id'>; problem: string | null } | null
    selectedPaving: string | null
    pavingPreview: [number, number][]
    pavingDraft: { x: number; z: number }[]
    pavingShape: 'rect' | 'outline'
    pavingSurface: PavingSurface
    pavingCloses: boolean
    pavingPoint: { x: number; z: number } | null
    selectedBed: string | null
    bedPreview: [number, number][]
    bedDraft: { x: number; z: number }[]
    bedShape: 'rect' | 'outline'
    bedCloses: boolean
    bedPoint: { x: number; z: number } | null
    s: (m: number) => number
  }

  let {
    planScope,
    document,
    planGround,
    selectedRetaining,
    retainingPreview,
    retainingDraft,
    retainingGuide,
    tool,
    selectedCarport,
    carportMove,
    carportGhost,
    selectedPaving,
    pavingPreview,
    pavingDraft,
    pavingShape,
    pavingSurface,
    pavingCloses,
    pavingPoint,
    selectedBed,
    bedPreview,
    bedDraft,
    bedShape,
    bedCloses,
    bedPoint,
    s,
  }: Props = $props()

  function dash(on: number, off: number): string {
    return `${s(on)} ${s(off)}`
  }
</script>

{#snippet carportShape(carport: Omit<Carport, 'id'>, state: 'placed' | 'picked' | 'ghost' | 'refused')}
  {@const ring = carportRing(carport)}
  {@const colour = state === 'refused' ? '#dc2626' : state === 'placed' ? '#57534e' : '#2563eb'}
  <polygon
    points={pointsAttr(ring.map((p) => [p.x, p.z] as SvgPoint))}
    fill={carportRoofSpec(carport.roof).colour}
    fill-opacity={state === 'ghost' || state === 'refused' ? 0.3 : 0.38}
    stroke={colour}
    stroke-width={s(state === 'placed' ? 0.03 : 0.06)}
    stroke-dasharray={dash(0.3, 0.16)}
  />
  <!-- A diagonal each way marks it as a roof with nothing under it; the way in is the open side. -->
  <path
    d="M {ring[0].x} {ring[0].z} L {ring[2].x} {ring[2].z} M {ring[1].x} {ring[1].z} L {ring[3].x} {ring[3].z}"
    stroke={colour}
    stroke-opacity="0.35"
    stroke-width={s(0.02)}
    fill="none"
  />
  {#each carportPosts(carport) as post, i (i)}
    <rect x={post.x - 0.06} y={post.z - 0.06} width="0.12" height="0.12" fill={colour} />
  {/each}
{/snippet}

<g class="site-layer" class:site-subdued={planScope === 'building'}>
  <g class="retaining" pointer-events="none">
    {#each document.retaining ?? [] as wall (wall.id)}
      {@const picked = selectedRetaining === wall.id}
      <polyline
        points={pointsAttr(wall.points.map(([x, z]) => [x, z] as SvgPoint))}
        fill="none"
        stroke={picked ? '#2563eb' : retainingSpec(wall.type).colour}
        stroke-width={retainingSpec(wall.type).thickness}
        stroke-linejoin="round"
      />
      <polyline points={pointsAttr(wall.points.map(([x, z]) => [x, z] as SvgPoint))} fill="none" stroke={picked ? '#1d4ed8' : '#44403c'} stroke-width={s(0.02)} />
      <!-- Ticks on the downhill side, the way the ground falls away from the wall. -->
      {#if planGround}
        {#each retainingSamples(wall, planGround).filter((_, i) => i % 2 === 0) as sample, i (i)}
          <line
            x1={sample.x}
            y1={sample.z}
            x2={sample.x + sample.down.x * 0.45}
            y2={sample.z + sample.down.z * 0.45}
            stroke={picked ? '#1d4ed8' : '#44403c'}
            stroke-width={s(0.02)}
          />
        {/each}
      {/if}
    {/each}
    {#if retainingPreview.length >= 2}
      <polyline
        points={pointsAttr(retainingPreview.map(([x, z]) => [x, z] as SvgPoint))}
        fill="none"
        stroke="#2563eb"
        stroke-width={s(0.05)}
        stroke-dasharray={dash(0.2, 0.12)}
      />
    {/if}
    {#if tool === 'draw-retaining'}
      {#each retainingDraft as point, i (i)}
        <circle cx={point.x} cy={point.z} r={s(0.1)} fill="#ffffff" stroke="#2563eb" stroke-width={s(0.04)} />
      {/each}
      {#if retainingGuide}
        <circle cx={retainingGuide.point.x} cy={retainingGuide.point.z} r={s(0.12)} fill="#2563eb" />
      {/if}
    {/if}
  </g>
  <g class="carports" pointer-events="none">
    {#each document.carports ?? [] as carport (carport.id)}
      {#if carportMove?.id === carport.id && carportMove.preview}
        {@render carportShape(carportMove.preview, carportMove.problem ? 'refused' : 'picked')}
      {:else}
        {@render carportShape(carport, selectedCarport === carport.id ? 'picked' : 'placed')}
      {/if}
    {/each}
    {#if carportGhost}
      {@render carportShape(carportGhost.carport, carportGhost.problem ? 'refused' : 'ghost')}
    {/if}
  </g>
  <g class="paving" pointer-events="none">
    {#each apronPolygons(document) as polygon, i (i)}
      <path
        d={[polygon.outer, ...polygon.holes].map((ring) => `M ${ring.map((p) => `${p.x} ${p.z}`).join(' L ')} Z`).join(' ')}
        fill-rule="evenodd"
        fill={PAVING[projectDefaults(document).apronSurface].colour}
        fill-opacity="0.55"
        stroke={selectedPaving === 'apron' ? '#2563eb' : 'none'}
        stroke-width={s(0.05)}
      />
    {/each}
    {#each document.paving ?? [] as area (area.id)}
      <polygon
        points={pointsAttr(area.ring.map(([x, z]) => [x, z] as SvgPoint))}
        fill={PAVING[area.surface].colour}
        fill-opacity="0.7"
        stroke={selectedPaving === area.id ? '#2563eb' : '#57534e'}
        stroke-width={s(selectedPaving === area.id ? 0.06 : 0.02)}
      />
    {/each}
    {#if pavingPreview.length >= 2}
      <polygon
        points={pointsAttr(pavingPreview.map(([x, z]) => [x, z] as SvgPoint))}
        fill={PAVING[pavingSurface].colour}
        fill-opacity="0.45"
        stroke="#2563eb"
        stroke-width={s(0.04)}
        stroke-dasharray="{s(0.2)} {s(0.12)}"
      />
    {/if}
    {#if tool === 'draw-paving'}
      {#each pavingDraft as corner, i (i)}
        <circle
          cx={corner.x}
          cy={corner.z}
          r={s(i === 0 && pavingShape === 'outline' && pavingDraft.length >= 3 ? (pavingCloses ? 0.28 : 0.2) : 0.1)}
          fill={i === 0 && pavingCloses ? '#2563eb' : '#ffffff'}
          stroke="#2563eb"
          stroke-width={s(0.04)}
        />
      {/each}
      {#if pavingPoint && !pavingCloses}
        <circle cx={pavingPoint.x} cy={pavingPoint.z} r={s(0.12)} fill="#2563eb" />
      {/if}
    {/if}
  </g>
  <g class="beds" pointer-events="none">
    {#each document.beds ?? [] as bed (bed.id)}
      {@const isRaised = bed.height > 0.05}
      {@const mat = bedMaterialSpec(bed.material)}
      {@const isSelected = selectedBed === bed.id}
      {#if isRaised}
        {@const inner = insetRing(bed.ring, mat.thickness)}
        <!-- Retaining wall band sitting inside the outline -->
        <polygon
          points={pointsAttr(bed.ring.map(([x, z]) => [x, z] as SvgPoint))}
          fill={mat.colour}
          stroke={isSelected ? '#2563eb' : '#44403c'}
          stroke-width={s(isSelected ? 0.05 : 0.015)}
        />
        <!-- Elevated soil inside the inner face -->
        <polygon
          points={pointsAttr(inner.map(([x, z]) => [x, z] as SvgPoint))}
          fill={BED_SOIL_COLOUR}
          fill-opacity="0.85"
          stroke="#44403c"
          stroke-width={s(0.015)}
        />
      {:else}
        <!-- In-ground bed: soil fill with optional edging border or dashed boundary -->
        <polygon
          points={pointsAttr(bed.ring.map(([x, z]) => [x, z] as SvgPoint))}
          fill={BED_SOIL_COLOUR}
          fill-opacity="0.5"
          stroke={isSelected ? '#2563eb' : (bed.material ? mat.colour : '#57534e')}
          stroke-width={s(isSelected ? 0.05 : (bed.material ? 0.025 : 0.02))}
          stroke-dasharray={!bed.material && !isSelected ? `${s(0.12)} ${s(0.08)}` : undefined}
        />
      {/if}
    {/each}
    {#if tool === 'draw-bed' && bedPreview.length >= 2}
      <polygon
        points={pointsAttr(bedPreview.map(([x, z]) => [x, z] as SvgPoint))}
        fill={BED_SOIL_COLOUR}
        fill-opacity="0.45"
        stroke="#2563eb"
        stroke-width={s(0.04)}
        stroke-dasharray="{s(0.2)} {s(0.12)}"
      />
    {/if}
    {#if tool === 'draw-bed'}
      {#each bedDraft as corner, i (i)}
        <circle
          cx={corner.x}
          cy={corner.z}
          r={s(i === 0 && bedShape === 'outline' && bedDraft.length >= 3 ? (bedCloses ? 0.28 : 0.2) : 0.1)}
          fill={i === 0 && bedCloses ? '#2563eb' : '#ffffff'}
          stroke="#2563eb"
          stroke-width={s(0.04)}
        />
      {/each}
      {#if bedPoint && !bedCloses}
        <circle cx={bedPoint.x} cy={bedPoint.z} r={s(0.12)} fill="#2563eb" />
      {/if}
    {/if}
  </g>
</g>
