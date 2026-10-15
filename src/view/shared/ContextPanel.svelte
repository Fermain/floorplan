<script lang="ts">
  import type { Component, Snippet } from 'svelte'
  import XIcon from '@lucide/svelte/icons/x'
  import { Button } from '$lib/components/ui/button'
  import { documentStore } from '$lib/state/document.svelte'

  // The panel for whatever is selected, in Plan, Focus and Review alike: down the right on a wide screen,
  // across the bottom on a narrow one. Standardized anatomy:
  // 1. Header (Icon, Tag, Title, Subtitle, Close)
  // 2. Estimate & Compliance (cost, daylight/vent, sizing warnings)
  // 3. Actions (Focus, edit, remove buttons)
  // 4. Properties (form controls, inputs)
  interface Props {
    label: string
    title?: string
    subtitle?: string
    tag?: string
    icon?: Component
    description?: string
    estimate?: Snippet
    actions?: Snippet
    onclose?: () => void
    children?: Snippet
  }

  let {
    label,
    title,
    subtitle,
    tag,
    icon: IconComponent,
    description,
    estimate,
    actions,
    onclose,
    children,
  }: Props = $props()
</script>

<aside class="context-panel" aria-label={label}>
  {#if title || onclose || IconComponent || tag}
    <header class="context-header">
      <div class="flex min-w-0 items-start gap-2.5">
        {#if IconComponent}
          <div class="context-icon shrink-0">
            <IconComponent class="size-4" />
          </div>
        {/if}
        <div class="grid min-w-0 gap-0.5">
          <div class="flex items-center gap-1.5">
            {#if tag}
              <span class="context-tag">{tag}</span>
            {/if}
            {#if title}
              <h2 class="truncate font-semibold text-sm leading-tight text-foreground">{title}</h2>
            {/if}
          </div>
          {#if subtitle}
            <p class="text-xs text-muted-foreground">{subtitle}</p>
          {/if}
          {#if description}
            <p class="text-xs text-muted-foreground mt-0.5 leading-normal">{description}</p>
          {/if}
        </div>
      </div>
      {#if onclose}
        <Button variant="ghost" size="icon-sm" class="-mt-1 -mr-1 shrink-0 text-muted-foreground hover:text-foreground" title="Close (Esc)" onclick={onclose}>
          <XIcon class="size-4" />
          <span class="sr-only">Close</span>
        </Button>
      {/if}
    </header>
  {/if}

  {#if estimate}
    <div class="context-estimate">
      {@render estimate()}
    </div>
  {/if}

  {#if actions}
    <div class="context-actions grid gap-2">
      {@render actions()}
    </div>
  {/if}

  <!-- Looking at an example, the panel says what is there but its controls are off. -->
  <div class="contents flex flex-col gap-3" class:looking={documentStore.readOnly}>
    {@render children?.()}
  </div>
</aside>

<style>
  /* Looking at an example: everything that would change it is off. A control marked data-look only shows
     something, such as a wall in Focus, and stays live. */
  .looking :global(:is(button, input, select, textarea, label, [role='combobox'], [role='radio'], [role='switch']):not([data-look])) {
    pointer-events: none;
    opacity: 0.55;
  }

  .context-panel {
    position: absolute;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
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
      position: relative;
      inset: auto;
      flex-shrink: 0;
      width: 18rem;
      height: 100%;
      max-height: none;
      border-top: none;
      border-left: 1px solid var(--border);
      padding-bottom: 1rem;
      box-shadow: -4px 0 12px rgb(0 0 0 / 0.06);
    }
  }

  .context-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.75rem;
  }

  .context-icon {
    margin-top: 0.125rem;
    display: flex;
    height: 1.75rem;
    width: 1.75rem;
    align-items: center;
    justify-content: center;
    border-radius: 0.375rem;
    background: var(--muted);
    color: var(--foreground);
  }

  .context-tag {
    display: inline-block;
    border-radius: 0.25rem;
    background: var(--muted);
    padding: 0.125rem 0.375rem;
    font-size: 0.625rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--muted-foreground);
  }

  .context-estimate {
    border-radius: 0.375rem;
    border: 1px solid color-mix(in oklab, var(--border) 80%, transparent);
    background: color-mix(in oklab, var(--muted) 40%, transparent);
    padding: 0.625rem 0.75rem;
    font-size: 0.75rem;
  }

  .context-actions {
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.75rem;
  }
</style>

