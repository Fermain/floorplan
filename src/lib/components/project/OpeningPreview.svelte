<script lang="ts">
  import { defaultOpeningDimensions } from '$lib/model/openings'
  import type { WallSystem } from '$lib/model/systems'
  import type { ProjectDefaults } from '$lib/model/types'
  import { WALL_HEAD } from '$lib/plot/fixture'

  let {
    system,
    defaults,
    class: className = '',
  }: { system: WallSystem; defaults: Partial<ProjectDefaults>; class?: string } = $props()

  const WIDTH = 4.2
  const pane = $derived(defaultOpeningDimensions('window', system, defaults))
  const door = $derived(defaultOpeningDimensions('external-door', system, defaults))
  const courses = $derived(Array.from({ length: Math.ceil(WALL_HEAD / system.courseHeight) }, (_, i) => i))
  const y = (v: number) => WALL_HEAD - v
  const mm = (m: number) => Math.round(m * 1000)
  const doorX = 0.6
  const windowX = $derived(Math.max(doorX + door.width + 0.6, WIDTH - pane.width - 0.6))
</script>

<svg class={className} viewBox="-0.9 -0.15 {WIDTH + 1.1} {WALL_HEAD + 0.35}" role="img" aria-label="Default opening sizes">
  <rect x="0" y="0" width={WIDTH} height={WALL_HEAD} class="fill-muted" />
  {#each courses as c (c)}
    <line
      x1="0"
      x2={WIDTH}
      y1={y((c + 1) * system.courseHeight)}
      y2={y((c + 1) * system.courseHeight)}
      class="stroke-muted-foreground/25"
      stroke-width="0.008"
    />
  {/each}
  <rect x={doorX} y={y(door.v + door.height)} width={door.width} height={door.height} class="fill-background stroke-foreground" stroke-width="0.025" />
  <rect x={windowX} y={y(pane.v + pane.height)} width={pane.width} height={pane.height} class="fill-sky-100 stroke-foreground" stroke-width="0.025" />
  <line x1="-0.05" x2={WIDTH + 0.05} y1={y(0)} y2={y(0)} class="stroke-foreground" stroke-width="0.02" />
  <g class="fill-muted-foreground font-sans" font-size="0.13">
    <text x={windowX + pane.width + 0.08} y={y(pane.v) + 0.05}>sill {mm(pane.v)}</text>
    <text x={windowX + pane.width + 0.08} y={y(pane.v + pane.height) + 0.1}>head {mm(pane.v + pane.height)}</text>
    <text x={windowX + pane.width / 2} y={y(pane.v + pane.height) - 0.06} text-anchor="middle">{mm(pane.width)}</text>
    <text x={doorX + door.width / 2} y={y(door.height) - 0.06} text-anchor="middle">door {mm(door.height)}</text>
    <text x="-0.85" y={y(0) + 0.05}>floor</text>
  </g>
</svg>
