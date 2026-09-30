<script lang="ts">
  import type { RoofForm } from '$lib/model/types'

  let { form, class: className = '' }: { form: RoofForm; class?: string } = $props()

  const roof = $derived(
    form === 'hip'
      ? 'M8 34 L26 16 L54 16 L72 34 Z'
      : form === 'gable'
        ? 'M8 34 L40 10 L72 34 Z'
        : 'M8 34 L8 22 L72 12 L72 34 Z',
  )
</script>

<svg class={className} viewBox="0 0 80 56" role="img" aria-label="{form} roof">
  <path d={roof} class="fill-foreground/80" />
  <rect x="14" y="34" width="52" height="18" class="fill-muted stroke-foreground/60" stroke-width="1.5" />
  <rect x="24" y="39" width="10" height="8" class="fill-background stroke-foreground/50" stroke-width="1" />
  <rect x="46" y="39" width="10" height="13" class="fill-background stroke-foreground/50" stroke-width="1" />
</svg>
