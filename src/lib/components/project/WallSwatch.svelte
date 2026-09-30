<script lang="ts">
  import { MORTAR_JOINT, wallThickness, type WallSystem } from '$lib/model/systems'

  let { system, class: className = '' }: { system: WallSystem; class?: string } = $props()

  const WIDTH = 1.2
  const HEIGHT = 0.6
  const GAP = 0.08
  const SECTION_SCALE = 1.4

  const fill = $derived(system.unitKey.startsWith('block') ? '#a1a1aa' : '#b4643c')
  const shade = $derived(system.unitKey.startsWith('block') ? '#8b8b93' : '#9a5230')
  const joint = MORTAR_JOINT

  const units = $derived.by(() => {
    const out: { x: number; y: number; w: number; h: number; odd: boolean }[] = []
    const courses = Math.ceil(HEIGHT / system.courseHeight)
    for (let c = 0; c < courses; c++) {
      const shift = c % 2 === 1 ? system.moduleLength / 2 : 0
      const y = HEIGHT - (c + 1) * system.courseHeight
      for (let x = -shift; x < WIDTH; x += system.moduleLength) {
        const x0 = Math.max(0, x)
        const x1 = Math.min(WIDTH, x + system.moduleLength - joint)
        if (x1 - x0 <= 0.005) continue
        out.push({ x: x0, y: Math.max(0, y), w: x1 - x0, h: system.courseHeight - joint - Math.max(0, -y), odd: (c + Math.round(x / system.moduleLength)) % 3 === 0 })
      }
    }
    return out.filter((unit) => unit.h > 0)
  })

  const section = $derived.by(() => {
    const total = wallThickness(system) * SECTION_SCALE
    const leaf = system.leafThickness * SECTION_SCALE
    const start = (WIDTH - total) / 2
    const leaves = system.leaves === 2 ? [start, start + total - leaf] : [start]
    return { total, leaf, leaves }
  })
</script>

<svg class={className} viewBox="0 0 {WIDTH} {HEIGHT + GAP + 0.14}" role="img" aria-label="{system.name} elevation and section">
  <rect width={WIDTH} height={HEIGHT} fill="#d6d3d1" />
  {#each units as unit, i (i)}
    <rect x={unit.x} y={unit.y} width={unit.w} height={unit.h} fill={unit.odd ? shade : fill} />
  {/each}
  <g transform="translate(0 {HEIGHT + GAP})">
    <rect width={WIDTH} height="0.1" class="fill-muted" />
    {#each section.leaves as x, i (i)}
      <rect {x} y="0" width={section.leaf} height="0.1" fill={fill} />
    {/each}
  </g>
</svg>
