<script lang="ts">
  import Maximize from '@lucide/svelte/icons/maximize'
  import RectangleHorizontal from '@lucide/svelte/icons/rectangle-horizontal'
  import ZoomIn from '@lucide/svelte/icons/zoom-in'
  import ZoomOut from '@lucide/svelte/icons/zoom-out'
  import { Button } from '$lib/components/ui/button'
  import * as Tooltip from '$lib/components/ui/tooltip'

  let {
    turn,
    bearing,
    zoom,
    aligned,
    canSquare,
    onTurn,
    onSquare,
    onZoomIn,
    onZoomOut,
    onFit,
    onClearReference,
  }: {
    turn: number
    bearing: number
    zoom: number
    aligned: boolean
    canSquare: boolean
    onTurn: (turn: number) => void
    onSquare: () => void
    onZoomIn: () => void
    onZoomOut: () => void
    onFit: () => void
    onClearReference: () => void
  } = $props()

  const SIZE = 76
  const R = SIZE / 2
  let dialEl = $state<SVGSVGElement | undefined>(undefined)
  let drag = $state<{ pointerId: number; start: number; from: number; moved: boolean } | null>(null)

  const northAngle = $derived(turn - bearing)
  const northUp = $derived(Math.abs(((((turn - bearing) % 360) + 540) % 360) - 180) < 0.05)

  function pointerAngle(event: PointerEvent): number {
    const rect = dialEl!.getBoundingClientRect()
    const x = event.clientX - rect.left - rect.width / 2
    const y = event.clientY - rect.top - rect.height / 2
    return (Math.atan2(x, -y) * 180) / Math.PI
  }

  function snap(next: number, free: boolean): number {
    if (free) return next
    const up = bearing
    const offset = ((((next - up) % 360) + 540) % 360) - 180
    if (Math.abs(offset) < 4) return up
    return Math.round(next / 15) * 15
  }

  function down(event: PointerEvent) {
    if (!dialEl) return
    dialEl.setPointerCapture(event.pointerId)
    drag = { pointerId: event.pointerId, start: pointerAngle(event), from: turn, moved: false }
  }

  function move(event: PointerEvent) {
    const current = drag
    if (!current || current.pointerId !== event.pointerId) return
    const delta = pointerAngle(event) - current.start
    if (!current.moved && Math.abs(delta) < 3) return
    drag = { ...current, moved: true }
    onTurn(snap(current.from + delta, event.shiftKey))
  }

  function up(event: PointerEvent) {
    const current = drag
    if (!current || current.pointerId !== event.pointerId) return
    drag = null
    if (!current.moved) onClearReference()
  }

  const ticks = Array.from({ length: 24 }, (_, i) => i * 15)
  const percent = $derived(Math.round(zoom * 100))
</script>

<Tooltip.Provider delayDuration={300}>
  <div class="pointer-events-auto flex items-end gap-2">
    <div class="flex flex-col items-center gap-1 rounded-xl border bg-background/95 p-1.5 shadow-sm backdrop-blur">
      <svg
        bind:this={dialEl}
        width={SIZE}
        height={SIZE}
        viewBox="{-R} {-R} {SIZE} {SIZE}"
        class="cursor-grab touch-none select-none active:cursor-grabbing"
        role="slider"
        tabindex="0"
        aria-label="Plan rotation"
        aria-valuenow={Math.round(turn)}
        aria-valuemin={0}
        aria-valuemax={359}
        onpointerdown={down}
        onpointermove={move}
        onpointerup={up}
        onpointercancel={up}
        onkeydown={(event) => {
          if (event.key === 'ArrowLeft') onTurn(turn - (event.shiftKey ? 1 : 15))
          if (event.key === 'ArrowRight') onTurn(turn + (event.shiftKey ? 1 : 15))
        }}
      >
        <title>Drag to turn the plan. Click to put the grid back on the view.</title>
        <circle r={R - 2} class="fill-muted/60 stroke-border" stroke-width="1" />
        <g transform="rotate({turn})">
          {#each ticks as tick (tick)}
            <line
              y1={-(R - 3)}
              y2={-(R - (tick % 90 === 0 ? 10 : 6))}
              transform="rotate({tick})"
              class={tick % 90 === 0 ? 'stroke-foreground/60' : 'stroke-muted-foreground/40'}
              stroke-width={tick % 90 === 0 ? 1.5 : 1}
            />
          {/each}
          <line x1={-(R - 14)} x2={R - 14} class={aligned ? 'stroke-blue-600' : 'stroke-muted-foreground/50'} stroke-width="1.5" />
          <line y1={-(R - 14)} y2={R - 14} class={aligned ? 'stroke-blue-600' : 'stroke-muted-foreground/50'} stroke-width="1.5" />
        </g>
        <g transform="rotate({northAngle})">
          <path d="M0 {-(R - 9)} L6 2 L0 -3 L-6 2 Z" class="fill-foreground" />
          <path d="M0 {R - 13} L5 0 L-5 0 Z" class="fill-muted-foreground/40" />
          <text
            y={-(R - 25)}
            text-anchor="middle"
            dominant-baseline="middle"
            font-size="10"
            class="fill-foreground font-sans font-semibold"
            transform="rotate({-northAngle} 0 {-(R - 25)})">N</text
          >
        </g>
      </svg>
      <span class="text-[11px] text-muted-foreground tabular-nums">
        {northUp ? 'North up' : `Turned ${Math.round(((((northAngle % 360) + 540) % 360) - 180))}°`}
      </span>
    </div>
    <div class="flex flex-col gap-1 rounded-xl border bg-background/95 p-1 shadow-sm backdrop-blur">
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button {...props} variant="ghost" size="icon-sm" aria-label="North up" onclick={() => onTurn(bearing)}>
              <span class="text-xs font-semibold">N</span>
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="right">Turn so north is up</Tooltip.Content>
      </Tooltip.Root>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button {...props} variant="ghost" size="icon-sm" aria-label="Square to wall" disabled={!canSquare} onclick={onSquare}>
              <RectangleHorizontal />
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="right">Turn so the selected wall runs across the screen</Tooltip.Content>
      </Tooltip.Root>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button {...props} variant="ghost" size="icon-sm" aria-label="Zoom in" onclick={onZoomIn}><ZoomIn /></Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="right">Zoom in (⌘ + scroll)</Tooltip.Content>
      </Tooltip.Root>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button {...props} variant="ghost" size="icon-sm" aria-label="Zoom out" onclick={onZoomOut}><ZoomOut /></Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="right">Zoom out</Tooltip.Content>
      </Tooltip.Root>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button {...props} variant="ghost" size="icon-sm" aria-label="Fit the plot" onclick={onFit}><Maximize /></Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="right">Fit the whole plot ({percent}%)</Tooltip.Content>
      </Tooltip.Root>
    </div>
  </div>
</Tooltip.Provider>
