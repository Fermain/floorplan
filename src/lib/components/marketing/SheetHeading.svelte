<script lang="ts">
  // A heading over a dimension line, as a measurement is written on a drawing. The line runs the heading's
  // width, with a tick at each end and the sheet's label in the middle.
  let { title, label, level = 2, size = 'md', id }: { title: string; label: string; level?: 1 | 2; size?: 'md' | 'lg'; id?: string } = $props()
  const lines = $derived(title.split('\n'))
</script>

<div class="inline-flex max-w-full flex-col gap-3.5 self-start">
  <svelte:element
    this={level === 1 ? 'h1' : 'h2'}
    {id}
    class="m-0 font-semibold tracking-tight text-balance {size === 'lg' ? 'text-[clamp(2.25rem,5vw,3.625rem)] leading-[1.05]' : 'text-[clamp(1.5rem,3.5vw,1.875rem)] leading-tight'}"
  >
    {#each lines as line, i (i)}{#if i > 0}<br />{/if}{line}{/each}
  </svelte:element>
  <span class="flex items-center text-line" aria-hidden="false">
    <span class="h-[9px] w-[1.5px] flex-none bg-current"></span>
    <span class="h-[1.5px] min-w-4 flex-1 bg-current"></span>
    <span class="px-2.5 font-mono text-xs font-medium tracking-[0.08em] uppercase max-sm:text-[11px] max-sm:whitespace-normal sm:whitespace-nowrap">{label}</span>
    <span class="h-[1.5px] min-w-4 flex-1 bg-current"></span>
    <span class="h-[9px] w-[1.5px] flex-none bg-current"></span>
  </span>
</div>
