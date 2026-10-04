<script lang="ts">
  import type { Snippet } from 'svelte'
  import { Popover } from 'bits-ui'
  import Info from '@lucide/svelte/icons/info'
  import { cn } from '$lib/utils'

  // An explanation kept out of the way: an "i" beside a heading or a field that opens a short note. It opens on a
  // click or a tap, so it works by touch, and closes on Esc or a click anywhere else.
  let { label = 'About this', class: className, children }: { label?: string; class?: string; children: Snippet } = $props()
</script>

<Popover.Root>
  <Popover.Trigger
    class={cn(
      'inline-grid size-5 shrink-0 place-items-center rounded-full align-middle text-muted-foreground outline-none hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-foreground/10 data-[state=open]:text-foreground',
      className,
    )}
    aria-label={label}
    title={label}
  >
    <Info class="size-3.5" />
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      sideOffset={6}
      collisionPadding={8}
      class="z-50 grid w-72 max-w-[calc(100vw-1rem)] gap-2 rounded-md border bg-popover p-3 text-[13px] leading-snug font-normal text-popover-foreground shadow-md outline-none"
    >
      {@render children()}
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
