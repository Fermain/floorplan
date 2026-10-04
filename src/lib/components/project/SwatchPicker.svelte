<script lang="ts" generics="T extends string">
  import { cn } from '$lib/utils'

  // A choice shown as swatches: each option is a patch of its colour or surface with its name under it.
  // `swatch` is any CSS background; an option without one shows as an empty, hatched patch.
  type Option = { id: T; name: string; swatch?: string | null; title?: string }

  let {
    options,
    value,
    onchange,
    label,
    disabled = false,
    compact = false,
    class: className,
  }: {
    options: readonly Option[]
    value: T | null
    onchange: (next: T) => void
    label: string
    disabled?: boolean
    // Compact drops the names under the swatches, for a toolbar or a narrow panel; they show as tooltips.
    compact?: boolean
    class?: string
  } = $props()

  const EMPTY = 'repeating-linear-gradient(45deg, transparent 0 4px, var(--border) 4px 5px)'

  function move(event: KeyboardEvent, index: number) {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const next = options[(index + step + options.length) % options.length]
    onchange(next.id)
    const group = event.currentTarget instanceof HTMLElement ? event.currentTarget.parentElement : null
    queueMicrotask(() => group?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus())
  }
</script>

<div
  class={cn('grid gap-1.5', compact ? 'grid-cols-[repeat(auto-fill,minmax(2rem,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))]', className)}
  role="radiogroup"
  aria-label={label}
  aria-disabled={disabled}
>
  {#each options as option, index (option.id)}
    {@const chosen = option.id === value}
    <button
      type="button"
      role="radio"
      aria-checked={chosen}
      aria-label={option.name}
      title={option.title ?? option.name}
      tabindex={chosen || (value === null && index === 0) ? 0 : -1}
      {disabled}
      class={cn(
        'group flex flex-col items-stretch gap-1 rounded-md p-0.5 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50',
        !disabled && 'hover:bg-muted',
      )}
      onclick={() => onchange(option.id)}
      onkeydown={(event) => move(event, index)}
    >
      <span
        class={cn(
          'block rounded-[5px] border border-black/15 shadow-xs',
          compact ? 'h-7' : 'h-9',
          chosen && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        )}
        style:background={option.swatch ?? EMPTY}
      ></span>
      {#if !compact}
        <span class={cn('line-clamp-2 text-xs leading-tight', chosen ? 'font-medium' : 'text-muted-foreground')}>{option.name}</span>
      {/if}
    </button>
  {/each}
</div>
