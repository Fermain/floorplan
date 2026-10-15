<script lang="ts">
  let {
    localGrid,
    outlineReference,
    guideTraces,
    s,
    dash,
  }: {
    localGrid: { x1: number; z1: number; x2: number; z2: number }[]
    outlineReference: unknown
    guideTraces: { x1: number; z1: number; x2: number; z2: number }[]
    s: (length: number) => number
    dash: (on: number, off: number) => string
  } = $props()
</script>

{#if localGrid.length > 0 && !outlineReference}
  <g clip-path="url(#plan-plot-clip)" pointer-events="none">
    {#each localGrid as line, i (i)}
      <line
        x1={line.x1}
        y1={line.z1}
        x2={line.x2}
        y2={line.z2}
        stroke="#93c5fd"
        stroke-width={s(0.012)}
      />
    {/each}
  </g>
{/if}
{#if guideTraces.length > 0}
  {#each guideTraces as trace, i (i)}
    <line
      x1={trace.x1}
      y1={trace.z1}
      x2={trace.x2}
      y2={trace.z2}
      stroke="#0891b2"
      stroke-width={s(0.03)}
      stroke-dasharray={dash(0.12, 0.08)}
      pointer-events="none"
    />
  {/each}
{/if}
