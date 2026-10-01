<script lang="ts">
  import { solidWallPolygonsForFloor } from '$lib/export/svg'
  import { roadReach, roadStrips } from '$lib/geometry/roads'
  import type { Document } from '$lib/model/types'

  // A small drawing of a project: the plot, its streets and the ground-floor walls, north up, framed to the far kerb.
  let { document, class: className = '' }: { document: Document; class?: string } = $props()

  const ring = $derived(document.plot.ring)
  const roads = $derived(roadStrips(document.plot))
  const ground = $derived(document.building.floors.find((floor) => floor.index === 0))
  const walls = $derived(ground ? solidWallPolygonsForFloor(ground) : [])
  const box = $derived.by(() => {
    const reach = [...ring, ...roadReach(document.plot)]
    const xs = reach.map(([x]) => x)
    const zs = reach.map(([, z]) => z)
    const pad = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) * 0.08
    return { x: Math.min(...xs) - pad, z: Math.min(...zs) - pad, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...zs) - Math.min(...zs) + pad * 2 }
  })
  const points = (list: { x: number; z: number }[] | [number, number][]) =>
    list.map((p) => (Array.isArray(p) ? `${p[0]},${p[1]}` : `${p.x},${p.z}`)).join(' ')
</script>

<svg class={className} viewBox="{box.x} {box.z} {box.w} {box.h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Plan of the plot">
  <g transform="translate(0 {box.z * 2 + box.h}) scale(1 -1)">
    {#each roads as strip (strip.edge)}
      <polygon points={points(strip.verge)} fill="#d6e2c4" />
    {/each}
    {#each roads as strip (strip.edge)}
      <polygon points={points(strip.road)} fill="#6b6b70" />
    {/each}
    <polygon points={points(ring)} fill="#eceae4" stroke="#18181b" stroke-width={box.w / 300} />
    {#each walls as polygon, i (i)}
      <polygon points={polygon.map(([x, z]) => `${x},${z}`).join(' ')} fill="#18181b" />
    {/each}
  </g>
</svg>
