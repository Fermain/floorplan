<script lang="ts">
  import { asset, resolve } from '$app/paths'
  import ArrowRight from '@lucide/svelte/icons/arrow-right'
  import { Button } from '$lib/components/ui/button'
  import { EXAMPLES } from '$lib/examples'
  import { exampleHref } from '$lib/routes/links'

  const REPO = 'https://github.com/Fermain/floorplan'
  const app = resolve('/app')
  const start = `${resolve('/app/new')}?step=site`

  // The tour down the page: one view of the app at a time, each with a picture of the same farmhouse.
  const tour = [
    {
      id: 'plan',
      title: 'Plan',
      lead: 'Draw on a real plot, to real sizes.',
      points: [
        'A plot with its true shape, slope, north point and street.',
        'Walls drawn corner to corner, snapping to each other and to whole bricks and blocks.',
        'Rooms form where walls close, with their net areas and floor finishes.',
        'Several buildings on one plot, up to four storeys each, with stairs laid out to the regulations.',
        'Driveways, paths, patios and an apron round the house.',
      ],
      image: 'plan.jpg',
      alt: 'Plan of three houses, two carports and a garage round a gravel yard, with named rooms and paving',
    },
    {
      id: 'focus',
      title: 'Focus',
      lead: 'Open any wall face-on and build it course by course.',
      points: [
        'Windows and doors sit on the courses, with lintels over them.',
        'Whole and cut units are counted as you work.',
        'Each face is left exposed, bagged or plastered, and painted.',
        'Sockets, switches, pipes and fittings are placed on the wall they belong to.',
      ],
      image: 'focus.jpg',
      alt: 'A plastered and painted cottage wall seen face-on, with a window and a dimension chain',
    },
    {
      id: 'review',
      title: 'Review',
      lead: 'See it stand on its ground, in the sun.',
      points: [
        'The model sits on the terrain, levelled under each building.',
        'Midsummer and midwinter sun at any hour, for the latitude of the plot.',
        'A cutaway opens the house as you move in; walls can be cut to half height or hidden.',
        'Roofs, gutters, solar panels, tanks, fences and paving are all there.',
      ],
      image: 'review-farm.jpg',
      alt: 'Three houses, a garage and carports on a sloping stand, seen from above with the road behind',
    },
    {
      id: 'quantities',
      title: 'Quantities',
      lead: 'A bill of quantities that keeps up with the drawing.',
      points: [
        'Bricks and blocks, mortar, lintels, concrete, roofing, plaster and paint.',
        'Electrical, plumbing, gas, paving and fencing.',
        'Every rate is yours to change, and so are the assumptions behind the figures.',
        'Download the sheet as CSV.',
      ],
      image: 'quantities.jpg',
      alt: 'A ruled sheet of masonry, mortar and lintel quantities with rates and an estimated total',
    },
    {
      id: 'checks',
      title: 'Checks',
      lead: 'The regulations, measured as you go.',
      points: [
        'Daylight, ventilation, floor area and width for each habitable room (SANS 10400 Parts O and C).',
        'Glazing against floor area for the whole house (Part XA).',
        'Circuits, board size and cable; drainage falls, hot water runs and rainwater.',
        'Load shedding: tick the circuits to keep on and get an inverter, battery and panel count.',
      ],
      image: 'checks.jpg',
      alt: 'Room checks listed in a sheet, each with its daylight, ventilation, area and width against the minimum',
    },
  ]

  const technology = [
    { name: 'SvelteKit and Svelte 5', text: 'A single-page app built to static files. There is no server to run.' },
    { name: 'three.js with Threlte', text: 'The 3D Review, its sun and shadows, and the cutaway.' },
    { name: 'Geometry in TypeScript', text: 'Walls, roofs, stairs, services and takeoff are plain functions with tests beside them.' },
    { name: 'Tailwind and shadcn-svelte', text: 'A plain, dense interface that works on a phone.' },
    { name: 'IndexedDB', text: 'Projects save in your browser as you work. Nothing is uploaded.' },
    { name: 'Open source', text: 'The code, the example houses and the rates are on GitHub.' },
  ]
</script>

<svelte:head>
  <title>Floorplan: house design, priced and checked as you draw</title>
</svelte:head>

<div class="min-h-dvh bg-background text-foreground">
  <header class="sticky top-0 z-20 flex items-center justify-between gap-3 border-b bg-background/95 px-4 py-2 backdrop-blur sm:px-6">
    <a class="text-sm font-semibold" href={resolve('/')}>Floorplan</a>
    <nav class="flex items-center gap-1 text-sm" aria-label="Site">
      <a class="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground max-sm:hidden" href="#tour">Features</a>
      <a class="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground max-sm:hidden" href="#technology">Technology</a>
      <a class="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground" href={REPO} rel="noreferrer">GitHub</a>
      <Button size="sm" class="ml-1" href={app}>Open the app</Button>
    </nav>
  </header>

  <main>
    <section class="border-b bg-muted/40">
      <div class="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[5fr_7fr] lg:items-center lg:py-16">
        <div class="grid gap-5">
          <h1 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Design a house brick by brick. Know what it costs before you build.
          </h1>
          <p class="max-w-xl text-base text-muted-foreground">
            Floorplan is a design tool for small, low-cost houses in South Africa. Draw on a sloping plot in real bricks
            and blocks, and get a bill of quantities and the SANS 10400 checks as you go.
          </p>
          <div class="flex flex-wrap gap-2">
            <Button href={app}>Open the app<ArrowRight /></Button>
            <Button variant="outline" href={start}>Start a new project</Button>
          </div>
          <ul class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <li>Runs in your browser</li>
            <li>No account</li>
            <li>Projects stay on your machine</li>
            <li>Free and open source</li>
          </ul>
        </div>
        <img
          class="w-full rounded-md border shadow-sm"
          src={asset('/shots/review.jpg')}
          width="1456"
          height="771"
          alt="A face-brick farmhouse with solar panels, a painted cottage and a carport, seen in the 3D Review"
        />
      </div>
    </section>

    <section id="tour" class="scroll-mt-12" aria-label="Features">
      {#each tour as item, index (item.id)}
        <div class="border-b {index % 2 === 1 ? 'bg-muted/40' : ''}">
          <div class="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[4fr_8fr] lg:items-start lg:py-14">
            <div class="grid gap-3 {index % 2 === 1 ? 'lg:order-2' : ''}">
              <p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">{item.title}</p>
              <h2 class="text-xl font-semibold tracking-tight text-balance">{item.lead}</h2>
              <ul class="grid gap-1.5 text-sm text-muted-foreground">
                {#each item.points as point (point)}
                  <li class="border-l-2 pl-3">{point}</li>
                {/each}
              </ul>
            </div>
            <img class="w-full rounded-md border shadow-sm" src={asset(`/shots/${item.image}`)} width="1456" height="771" loading="lazy" alt={item.alt} />
          </div>
        </div>
      {/each}
    </section>

    <section class="border-b" aria-labelledby="examples-heading">
      <div class="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[4fr_8fr] lg:items-start lg:py-14">
        <div class="grid gap-3">
          <p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Examples</p>
          <h2 id="examples-heading" class="text-xl font-semibold tracking-tight text-balance">Start from a finished house.</h2>
          <p class="text-sm text-muted-foreground">
            Six example projects come with the app, from a tight city house to the multi generation farmhouse in these
            pictures: three homes, a garage and two carports, with solar, rainwater, a septic tank, paving and paint.
            Preview any of them here, in the plan, in 3D and down to the bill of quantities, then open a copy
            and change it.
          </p>
          <ul class="grid border-t text-sm">
            {#each EXAMPLES as example (example.id)}
              <li class="border-b">
                <a class="flex items-baseline justify-between gap-3 py-1.5 hover:bg-muted" href={exampleHref(example.id)}>
                  <span class="font-medium">{example.name}</span>
                  <span class="truncate text-xs text-muted-foreground">{example.place}</span>
                </a>
              </li>
            {/each}
          </ul>
          <div><Button variant="outline" href={app}>See them in the app<ArrowRight /></Button></div>
        </div>
        <img class="w-full rounded-md border shadow-sm" src={asset('/shots/home.jpg')} width="1456" height="771" loading="lazy" alt="The project picker, with the examples listed beside a preview and an estimate for each" />
      </div>
    </section>

    <section id="technology" class="scroll-mt-12 border-b bg-muted/40" aria-labelledby="technology-heading">
      <div class="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:py-14">
        <div class="grid gap-2">
          <p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Technology</p>
          <h2 id="technology-heading" class="text-xl font-semibold tracking-tight">How it is built.</h2>
        </div>
        <dl class="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {#each technology as item (item.name)}
            <div class="border-t pt-3">
              <dt class="text-sm font-semibold">{item.name}</dt>
              <dd class="text-sm text-muted-foreground">{item.text}</dd>
            </div>
          {/each}
        </dl>
      </div>
    </section>

    <section class="border-b">
      <div class="mx-auto grid max-w-7xl gap-4 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <p class="max-w-3xl text-sm text-muted-foreground">
          Floorplan helps you think a design through and get a rough idea of its cost. It does not replace an architect,
          an engineer or plan approval. Rates are examples, not quotes, and the checks are a guide to SANS 10400 that
          must be confirmed against the standard.
        </p>
        <Button href={app}>Open the app<ArrowRight /></Button>
      </div>
    </section>
  </main>

  <footer class="flex flex-wrap items-center justify-between gap-2 px-4 py-4 text-sm text-muted-foreground sm:px-6">
    <span>Floorplan</span>
    <a class="hover:text-foreground" href={REPO} rel="noreferrer">Source on GitHub</a>
  </footer>
</div>
