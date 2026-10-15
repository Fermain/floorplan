<script lang="ts">
  import type { SvgPoint } from '../../../lib/export/svg'
  import { pointsAttr } from '../svg'
  import { centreDashes, type RoadStrip } from '../../../lib/geometry/roads'
  import type { PlanScope } from '../scope'

  let {
    roads,
    plotRing,
    selectedEdge,
    planScope,
    contours,
    s,
  }: {
    roads: RoadStrip[]
    plotRing: [number, number][]
    selectedEdge: number | null
    planScope: PlanScope
    contours: { minor: string; major: string }
    s: (length: number) => number
  } = $props()
</script>

<g class="roads" pointer-events="none">
  <!-- In layers, so where roads meet each one's tar covers the other's verge. -->
  {#each roads as strip (strip.edge)}
    <polygon points={pointsAttr(strip.verge.map((p) => [p.x, p.z] as SvgPoint))} class="verge" />
  {/each}
  {#each roads as strip (strip.edge)}
    <polygon points={pointsAttr(strip.road.map((p) => [p.x, p.z] as SvgPoint))} class="carriageway" />
  {/each}
  {#each centreDashes(roads) as [a, b], i (i)}
    <line x1={a.x} y1={a.z} x2={b.x} y2={b.z} class="centre-line" stroke-width={0.12} />
  {/each}
</g>
<polygon
  points={pointsAttr(plotRing.map(([x, z]) => [x, z] as SvgPoint))}
  fill="#e7e5e4"
  stroke="#18181b"
  stroke-width={s(planScope === 'site' ? 0.08 : 0.06)}
/>
{#if selectedEdge !== null}
  {@const a = plotRing[selectedEdge]}
  {@const b = plotRing[(selectedEdge + 1) % plotRing.length]}
  {#if a && b}
    <line
      x1={a[0]}
      y1={a[1]}
      x2={b[0]}
      y2={b[1]}
      stroke="#2563eb"
      stroke-width={s(0.08)}
      pointer-events="none"
    />
  {/if}
{/if}
<g clip-path="url(#plan-plot-clip)" pointer-events="none" class="contours" class:opacity-50={planScope === 'building'}>
  {#if contours.minor}
    <path
      d={contours.minor}
      fill="none"
      stroke="#7c6a58"
      stroke-width={s(0.016)}
      stroke-linecap="round"
    />
  {/if}
  {#if contours.major}
    <path
      d={contours.major}
      fill="none"
      stroke="#3f3428"
      stroke-width={s(0.032)}
      stroke-linecap="round"
    />
  {/if}
</g>

<style>
  .verge {
    fill: #d6e2c4;
  }
  .carriageway {
    fill: #6b6b70;
  }
  .centre-line {
    stroke: #f5f5f4;
  }
</style>
