<script lang="ts">
  import { corniceSpec, skirtingSpec } from '$lib/model/trims'
  import type { CorniceType, SkirtingType } from '$lib/model/types'

  let { kind, type, class: className = '' }: { kind: 'skirting' | 'cornice'; type: SkirtingType | CorniceType | 'none'; class?: string } = $props()

  // Drawn in section: the wall on the left, the floor or ceiling across, the profile in the corner.
  const SCALE = 520
  const profile = $derived(
    type === 'none' ? [] : kind === 'skirting' ? skirtingSpec(type as SkirtingType).profile : corniceSpec(type as CorniceType).profile,
  )
  const points = $derived(
    profile.map(([x, y]) => `${22 + x * SCALE},${kind === 'skirting' ? 62 - y * SCALE : 10 - y * SCALE}`).join(' '),
  )
</script>

<svg viewBox="0 0 120 72" class={className} aria-hidden="true">
  <rect x="0" y="0" width="22" height="72" class="fill-muted" />
  {#if kind === 'skirting'}
    <rect x="0" y="62" width="120" height="10" class="fill-muted" />
  {:else}
    <rect x="0" y="0" width="120" height="10" class="fill-muted" />
  {/if}
  {#if points}
    <polygon {points} class="fill-background stroke-foreground" stroke-width="1.2" stroke-linejoin="round" />
  {:else}
    <text x="70" y="40" text-anchor="middle" class="fill-muted-foreground text-[11px]">None</text>
  {/if}
</svg>
