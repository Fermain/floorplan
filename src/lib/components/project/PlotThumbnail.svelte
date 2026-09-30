<script lang="ts">
  import { contourPlanPaths } from '$lib/geometry/contours'
  import type { Heightfield, Plot } from '$lib/model/types'

  let { plot, heightfield, class: className = '' }: { plot: Plot; heightfield: Heightfield; class?: string } = $props()
  const uid = $props.id()

  const bounds = $derived.by(() => {
    const xs = plot.ring.map(([x]) => x)
    const zs = plot.ring.map(([, z]) => z)
    const pad = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) * 0.2
    return {
      x: Math.min(...xs) - pad,
      y: -Math.max(...zs) - pad,
      w: Math.max(...xs) - Math.min(...xs) + 2 * pad,
      h: Math.max(...zs) - Math.min(...zs) + 2 * pad,
    }
  })
  const contours = $derived(contourPlanPaths(heightfield))
  const ring = $derived(plot.ring.map(([x, z]) => `${x},${-z}`).join(' '))
  const planRing = $derived(plot.ring.map(([x, z]) => `${x},${z}`).join(' '))
  const arrow = $derived.by(() => {
    const size = Math.min(bounds.w, bounds.h) * 0.12
    const cx = bounds.x + bounds.w - size * 0.7
    const cy = bounds.y + size * 0.8
    return { cx, cy, size, rotate: -plot.northBearingDeg }
  })
</script>

<svg class={className} viewBox="{bounds.x} {bounds.y} {bounds.w} {bounds.h}" role="img" aria-label="Plot outline">
  <defs>
    <clipPath id="thumb-{uid}">
      <polygon points={planRing} />
    </clipPath>
  </defs>
  <polygon points={ring} class="fill-muted" />
  <g transform="scale(1,-1)" clip-path="url(#thumb-{uid})">
    <path d={contours.minor} class="fill-none stroke-muted-foreground/40" stroke-width={bounds.w / 300} />
    <path d={contours.major} class="fill-none stroke-muted-foreground/70" stroke-width={bounds.w / 180} />
  </g>
  <polygon points={ring} class="fill-none stroke-foreground" stroke-width={bounds.w / 120} stroke-linejoin="round" />
  <g transform="translate({arrow.cx} {arrow.cy}) rotate({arrow.rotate})">
    <path
      d="M0 {-arrow.size * 0.6} L{arrow.size * 0.28} {arrow.size * 0.35} L0 {arrow.size * 0.18} L{-arrow.size * 0.28} {arrow.size * 0.35} Z"
      class="fill-foreground"
    />
    <text y={arrow.size * 1.05} text-anchor="middle" font-size={arrow.size * 0.55} class="fill-foreground font-sans">N</text>
  </g>
</svg>
