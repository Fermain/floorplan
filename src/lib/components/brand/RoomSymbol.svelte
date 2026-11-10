<script lang="ts">
  // The Floorplan symbol: a room in plan with its door drawn open. Every part is a filled shape on a 40-unit
  // grid, so it stays crisp at any size. At small sizes the window in the top wall is drawn as a plain gap.
  let { size = 26, small = true, class: className = '' }: { size?: number; small?: boolean; class?: string } = $props()
</script>

<svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" class={className}>
  {#if small}
    <path d="M0 0H14V4H4V40H0Z M26 0H40V40H22V36H36V4H26Z" fill="currentColor" />
  {:else}
    <path d="M0 0H40V40H22V36H36V4H4V40H0Z M14 1H26V3H14Z" fill="currentColor" fill-rule="evenodd" />
  {/if}
  <rect x="20" y="24" width="2" height="16" fill="currentColor" />
  <path d="M20 24A16 16 0 0 0 4 40H5.5A14.5 14.5 0 0 1 20 25.5Z" fill="var(--line)" />
</svg>
