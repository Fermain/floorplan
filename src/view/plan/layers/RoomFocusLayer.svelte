<script lang="ts">
  import { pointsAttr } from '../svg'
  import type { SvgPoint } from '../../../lib/export/svg'

  interface Props {
    focusedCells: { rings: { x: number; z: number }[][] } | null
    s: (m: number) => number
  }

  let { focusedCells, s }: Props = $props()
</script>

{#if focusedCells}
  <!-- Everything outside the room being laid out is veiled, so the room reads on its own. -->
  <path
    d="M -10000 -10000 H 20000 V 20000 H -10000 Z {focusedCells.rings.map((ring) => `M ${ring.map((p) => `${p.x} ${p.z}`).join(' L ')} Z`).join(' ')}"
    fill="var(--background)"
    fill-opacity="0.88"
    fill-rule="evenodd"
    pointer-events="none"
  />
  {#each focusedCells.rings as ring, i (i)}
    <polygon
      points={pointsAttr(ring.map((p) => [p.x, p.z] as SvgPoint))}
      fill="none"
      stroke="#2563eb"
      stroke-width={s(0.03)}
      stroke-linejoin="round"
      pointer-events="none"
    />
  {/each}
{/if}
