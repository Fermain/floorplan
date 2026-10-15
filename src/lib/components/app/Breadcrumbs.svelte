<script lang="ts">
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import type { BreadcrumbItem } from '$lib/state/workspace.svelte'

  interface Props {
    items: BreadcrumbItem[]
  }

  let { items }: Props = $props()
</script>

{#if items.length > 0}
  <nav aria-label="Spatial navigation" class="flex min-w-0 items-center gap-1 text-xs sm:text-sm">
    {#each items as item, index (item.label + index)}
      {#if index > 0}
        <ChevronRight class="size-3 shrink-0 text-muted-foreground/60 sm:size-3.5" aria-hidden="true" />
      {/if}
      {#if item.current || (!item.href && !item.onclick)}
        <span
          class="min-w-0 truncate font-medium text-foreground {item.current ? 'font-semibold' : ''}"
          aria-current={item.current ? 'location' : undefined}
          title={item.label}
        >
          {item.label}
        </span>
      {:else if item.href}
        <a
          href={item.href}
          class="min-w-0 truncate text-muted-foreground transition-colors hover:text-foreground hover:underline"
          title={item.label}
        >
          {item.label}
        </a>
      {:else if item.onclick}
        <button
          type="button"
          onclick={item.onclick}
          class="min-w-0 truncate text-muted-foreground transition-colors hover:text-foreground hover:underline"
          title={item.label}
        >
          {item.label}
        </button>
      {/if}
    {/each}
  </nav>
{/if}
