<script lang="ts">
  import type { Snippet } from 'svelte'
  import XIcon from '@lucide/svelte/icons/x'
  import { Button } from '$lib/components/ui/button'

  // The panel for whatever is selected, in Plan and Focus alike: down the right on a wide screen, across the bottom
  // on a narrow one. It sits beside the drawing rather than over it, so the drawing stays live while it is open.
  let {
    label,
    title,
    description,
    onclose,
    children,
  }: { label: string; title?: string; description?: string; onclose?: () => void; children: Snippet } = $props()
</script>

<aside class="context-panel" aria-label={label}>
  {#if title || onclose}
    <header class="flex items-start justify-between gap-2">
      <div class="grid gap-1">
        {#if title}<h2 class="font-semibold">{title}</h2>{/if}
        {#if description}<p class="text-muted-foreground">{description}</p>{/if}
      </div>
      {#if onclose}
        <Button variant="ghost" size="icon-sm" class="-mt-1 -mr-1 shrink-0" title="Close (Esc)" onclick={onclose}>
          <XIcon />
          <span class="sr-only">Close</span>
        </Button>
      {/if}
    </header>
  {/if}
  {@render children()}
</aside>

<style>
  .context-panel {
    position: absolute;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow-y: auto;
    background: var(--background);
    padding: 1rem;
    padding-bottom: max(1rem, env(safe-area-inset-bottom));
    font-size: 0.875rem;
    inset: auto 0 0 0;
    max-height: min(24rem, 62%);
    width: 100%;
    border-top: 1px solid var(--border);
    box-shadow: 0 -4px 12px rgb(0 0 0 / 0.06);
  }

  @media (min-width: 768px) {
    .context-panel {
      inset: 0 0 0 auto;
      max-height: none;
      width: 16rem;
      border-top: none;
      border-left: 1px solid var(--border);
      padding-bottom: 1rem;
      box-shadow: -4px 0 12px rgb(0 0 0 / 0.06);
    }
  }
</style>
