<script lang="ts">
  import type { CoveringSpec } from '$lib/geometry/coverings'

  let { spec, class: className = '' }: { spec: CoveringSpec; class?: string } = $props()

  const id = $derived(`covering-${spec.id}`)
  const w = $derived(spec.kind === 'tile' ? spec.across : spec.across * 2)
  const h = $derived(spec.kind === 'tile' ? spec.along : 0.4)
</script>

<svg class={className} viewBox="0 0 1.2 0.6" preserveAspectRatio="xMidYMid slice" role="img" aria-label={spec.name}>
  <defs>
    <pattern {id} width={w} height={h} patternUnits="userSpaceOnUse">
      <rect width={w} height={h} fill={spec.colour} />
      {#if spec.kind === 'tile'}
        <rect width={w * 0.08} height={h} fill={spec.shade} opacity="0.5" />
        <rect y={h * 0.82} width={w} height={h * 0.18} fill={spec.shade} opacity="0.85" />
      {:else if spec.id === 'ibr'}
        <rect width={w * 0.12} height={h} fill={spec.shade} />
        <rect x={w * 0.5} width={w * 0.12} height={h} fill={spec.shade} />
      {:else}
        <rect width={w * 0.25} height={h} fill={spec.shade} opacity="0.5" />
        <rect x={w * 0.5} width={w * 0.25} height={h} fill={spec.shade} opacity="0.5" />
      {/if}
    </pattern>
  </defs>
  <rect width="1.2" height="0.6" fill="url(#{id})" />
</svg>
