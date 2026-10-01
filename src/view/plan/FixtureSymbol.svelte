<script lang="ts">
  import { BOTTLE_GAP_M, BOTTLES, bottleSetup, CAGE_M, fixtureSize, fixtureSpec } from '../../lib/model/fixtures'
  import { tankSlabSide } from '../../lib/geometry/fixtures'
  import type { Fixture } from '../../lib/model/types'

  let {
    fixture,
    chosen = false,
    ghost = false,
    invalid = false,
    line,
  }: { fixture: Fixture; chosen?: boolean; ghost?: boolean; invalid?: boolean; line: number } = $props()

  const spec = $derived(fixtureSpec(fixture.kind))
  const size = $derived(fixtureSize(fixture))
  const w = $derived(size.width)
  const d = $derived(size.depth)
  const bottles = $derived(bottleSetup(fixture))
  // Local frame: x runs along the wall, y out into the room, origin at the middle of the footprint.
  const matrix = $derived(`matrix(${-fixture.dz} ${fixture.dx} ${fixture.dx} ${fixture.dz} ${fixture.x} ${fixture.z})`)
  const tone = $derived(invalid ? 'invalid' : spec.trade)
</script>

<g transform={matrix} class="fixture {tone}" class:chosen class:ghost style:--line={line}>
  {#if fixture.kind === 'light' || fixture.kind === 'outdoor-light'}
    {@const r = fixture.kind === 'light' ? 0.15 : 0.1}
    <circle r={r} class="fill" />
    <line x1={-r * 0.7} y1={-r * 0.7} x2={r * 0.7} y2={r * 0.7} />
    <line x1={-r * 0.7} y1={r * 0.7} x2={r * 0.7} y2={-r * 0.7} />
  {:else if fixture.kind === 'switch' || fixture.kind === 'stove-isolator'}
    <circle r={0.06} class="fill" />
    <line x1={0} y1={0} x2={0.09} y2={0.09} />
  {:else if fixture.kind === 'socket'}
    <rect x={-w / 2} y={-d / 2} width={w} height={0.08} class="fill" />
    <line x1={-0.035} y1={0.03} x2={-0.035} y2={0.08} />
    <line x1={0.035} y1={0.03} x2={0.035} y2={0.08} />
  {:else if fixture.kind === 'extractor'}
    <rect x={-w / 2} y={-d / 2} width={w} height={d} class="fill" />
    <circle r={0.05} />
  {:else if fixture.kind === 'db-board'}
    <rect x={-w / 2} y={-d / 2} width={w} height={d} class="solid" />
  {:else if fixture.kind === 'wc'}
    <rect x={-0.18} y={-d / 2} width={0.36} height={0.18} class="fill" />
    <ellipse cx={0} cy={0.1} rx={0.17} ry={0.24} class="fill" />
  {:else if fixture.kind === 'basin'}
    <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={0.04} class="fill" />
    <ellipse cx={0} cy={0.02} rx={w * 0.33} ry={d * 0.3} />
  {:else if fixture.kind === 'shower'}
    <rect x={-w / 2} y={-d / 2} width={w} height={d} class="fill" />
    <line x1={-w / 2} y1={-d / 2} x2={w / 2} y2={d / 2} />
    <line x1={-w / 2} y1={d / 2} x2={w / 2} y2={-d / 2} />
  {:else if fixture.kind === 'bath'}
    <rect x={-w / 2} y={-d / 2} width={w} height={d} class="fill" />
    <rect x={-w / 2 + 0.08} y={-d / 2 + 0.08} width={w - 0.16} height={d - 0.16} rx={0.15} />
  {:else if fixture.kind === 'sink'}
    <rect x={-w / 2} y={-d / 2} width={w} height={d} class="fill" />
    <rect x={-0.4} y={-d / 2 + 0.08} width={0.42} height={d - 0.2} rx={0.04} />
  {:else if fixture.kind === 'washing-machine'}
    <rect x={-w / 2} y={-d / 2} width={w} height={d} class="fill" />
    <circle r={0.2} />
  {:else if fixture.kind === 'geyser' || fixture.kind === 'solar-geyser'}
    <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={d / 2} class="fill dashed" />
    {#if fixture.kind === 'solar-geyser'}
      <circle r={0.08} />
      {#each [0, 45, 90, 135, 180, 225, 270, 315] as angle (angle)}
        <line x1={0.11} y1={0} x2={0.16} y2={0} transform="rotate({angle})" />
      {/each}
    {/if}
  {:else if fixture.kind === 'water-tank'}
    {@const slab = tankSlabSide(w)}
    <rect x={-slab / 2} y={-slab / 2} width={slab} height={slab} class="fill" />
    <circle r={w / 2} />
    <circle r={w / 2 - 0.12} />
  {:else if fixture.kind === 'stove' || fixture.kind === 'gas-stove'}
    <rect x={-w / 2} y={-d / 2} width={w} height={d} class="fill" />
    {#each [-0.14, 0.14] as x (x)}
      {#each [-0.1, 0.12] as y (y)}
        <circle cx={x} cy={y} r={0.08} class:solid={fixture.kind === 'stove'} />
      {/each}
    {/each}
  {:else if fixture.kind === 'gas-geyser'}
    <rect x={-w / 2} y={-d / 2} width={w} height={d} class="fill" />
    <path d="M 0 {d / 2 - 0.03} q -0.07 -0.06 0 -{d - 0.06} q 0.07 0.06 0 {d - 0.06}" />
  {:else if fixture.kind === 'gas-cylinder'}
    {@const bottle = BOTTLES[bottles.kg]}
    {@const wrap = bottles.cage ? CAGE_M : 0}
    <rect x={-w / 2} y={-d / 2} width={w} height={d} class:dashed={!bottles.cage} />
    {#each Array.from({ length: bottles.count }, (_, i) => -w / 2 + wrap + bottle.dia / 2 + i * (bottle.dia + BOTTLE_GAP_M)) as x (x)}
      <circle cx={x} cy={0} r={bottle.dia / 2} class="fill" />
      <circle cx={x} cy={0} r={0.06} />
    {/each}
  {:else if fixture.kind === 'outside-tap'}
    <circle r={0.05} class="solid" />
  {/if}
</g>

<style>
  .fixture {
    --ink: #52525b;
    stroke: var(--ink);
    stroke-width: var(--line);
    fill: none;
  }
  .fixture.electrical {
    --ink: #b45309;
  }
  .fixture.plumbing {
    --ink: #0369a1;
  }
  .fixture.gas {
    --ink: #a21caf;
  }
  .fixture.invalid {
    --ink: #b91c1c;
  }
  .fixture .fill {
    fill: #ffffff;
  }
  .fixture .solid {
    fill: var(--ink);
  }
  .fixture .dashed {
    stroke-dasharray: calc(var(--line) * 4) calc(var(--line) * 3);
  }
  .fixture.ghost {
    opacity: 0.75;
  }
  .fixture.chosen {
    --ink: #2563eb;
    stroke-width: calc(var(--line) * 2);
  }
</style>
