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
        'Kitchen counters, islands and bars, with sinks and hobs set into them.',
        'Carports, retaining walls, driveways, paths and patios outside.',
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
        'The ground line, the floor level and the damp-proof course are drawn under the wall.',
      ],
      image: 'focus.jpg',
      alt: 'A face-brick wall seen from outside, with a window, a rainwater tank, a dimension chain and the ground line under it',
    },
    {
      id: 'review',
      title: 'Review',
      lead: 'See it stand on its ground, in the sun.',
      points: [
        'The model sits on the terrain, levelled under each building.',
        'Midsummer and midwinter sun at any hour, for the latitude of the plot.',
        'A cutaway opens the house as you move in; walls can be cut to half height or hidden.',
        'Roofs, gutters, solar panels, tanks, fences, carports and retaining walls are all there.',
      ],
      image: 'review-farm.jpg',
      alt: 'Three houses, a garage and carports on a sloping stand, seen from above with the road behind',
    },
    {
      id: 'services',
      title: 'Services',
      lead: 'Look through the walls at the pipes and cables.',
      points: [
        'One switch fades the building and draws what runs through it.',
        'Drains, cold and hot water, lighting, plugs, the stove and geyser circuits, and gas, each in its own colour.',
        'A legend gives the length of each.',
        'The routes are indicative: where a run would go, not a drawing to build from.',
      ],
      image: 'services.jpg',
      alt: 'The farmhouse faded to a ghost, with drains, water pipes and electrical circuits drawn through it in colour',
    },
    {
      id: 'quantities',
      title: 'Quantities',
      lead: 'A bill of quantities that keeps up with the drawing.',
      points: [
        'Bricks and blocks, mortar, lintels, concrete, roofing, plaster and paint.',
        'Electrical, plumbing, gas, joinery, paving and fencing.',
        'Every rate is yours to change, and so are the assumptions behind the figures.',
        'Download the sheet as CSV.',
      ],
      image: 'quantities.jpg',
      alt: 'A ruled sheet of masonry, mortar and lintel quantities with rates and an estimated total',
    },
    {
      id: 'alterations',
      title: 'Alterations',
      lead: 'Change a house that is already built, and price only the change.',
      points: [
        'Draw the house as it stands and mark it as built.',
        'What you change after that is picked out on the plan: new walls in green, walls taken down in red.',
        'Quantities prices the difference and the breaking out, not the whole house.',
        'Put the drawing back to the house as built at any time.',
      ],
      image: 'alterations.jpg',
      alt: 'The farmhouse plan with a new wall across the living room in green and a wall taken down between two rooms in red',
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

  // The example the hero offers to preview: the one in the pictures.
  const showcase = EXAMPLES.find((example) => example.id === 'multi-generation') ?? EXAMPLES[0]

  const more = [
    { name: 'Menus you already know', text: 'File, Edit, View, Draw and Help over every project, beside one-click toolbars for the tools in constant use.' },
    { name: 'Kitchens', text: 'Lay out one room on its own. Counters close up to stoves and sinks, and a hob can be built into the worktop.' },
    { name: 'Retaining walls', text: 'Drawn along a bank and built in retaining blocks, course by course. Over a metre is flagged for an engineer.' },
    { name: 'Off-grid', text: 'Septic tanks, rainwater tanks under downpipes, gas bottles, solar panels, an inverter and a battery, all counted.' },
    { name: 'Light and dark', text: 'The app follows your device. Drawings stay on light paper either way.' },
    { name: 'Backups', text: 'Download every project in one file, and restore it on another machine.' },
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

<!-- One measure for the whole page: every section sits in the same column, with the same gutters and the same
     space above and below, so headings and pictures line up from top to bottom. -->
{#snippet eyebrow(text: string)}
  <p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">{text}</p>
{/snippet}

<div class="min-h-dvh bg-background text-foreground">
  <header class="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
    <div class="wrap flex items-center justify-between gap-3 py-2">
      <a class="text-sm font-semibold" href={resolve('/')}>Floorplan</a>
      <nav class="flex items-center gap-1 text-sm" aria-label="Site">
        <a class="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground max-sm:hidden" href="#tour">Features</a>
        <a class="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground max-sm:hidden" href="#examples">Examples</a>
        <a class="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground max-md:hidden" href="#technology">Technology</a>
        <a class="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground" href={REPO} rel="noreferrer">GitHub</a>
        <Button size="sm" class="ml-1" href={app}>Open the app</Button>
      </nav>
    </div>
  </header>

  <main>
    <section class="border-b bg-muted/40">
      <div class="wrap row py-12 lg:items-center lg:py-20">
        <div class="grid gap-6">
          <h1 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Design a house brick by brick. Know what it costs before you build.
          </h1>
          <p class="text-base text-muted-foreground">
            Floorplan is a design tool for small, low-cost houses in South Africa. Draw on a sloping plot in real bricks
            and blocks, and get a bill of quantities and the SANS 10400 checks as you go.
          </p>
          <div class="flex flex-wrap gap-2">
            <Button href={app}>Open the app<ArrowRight /></Button>
            <Button variant="outline" href={exampleHref(showcase.id)}>Preview an example</Button>
          </div>
          <p class="text-sm text-muted-foreground">Runs in your browser, with no account. Projects stay on your machine. Free and open source.</p>
        </div>
        <img
          class="w-full rounded-md border shadow-sm"
          src={asset('/shots/review.jpg')}
          width="1456"
          height="763"
          alt="A face-brick farmhouse with solar panels, a painted cottage and a carport, seen in the 3D Review"
        />
      </div>
    </section>

    <section id="tour" class="scroll-mt-12" aria-label="Features">
      {#each tour as item, index (item.id)}
        <div class="border-b {index % 2 === 1 ? 'bg-muted/40' : ''}">
          <div class="wrap row py-12 lg:py-20">
            <div class="grid content-start gap-4">
              {@render eyebrow(item.title)}
              <h2 class="text-xl font-semibold tracking-tight text-balance">{item.lead}</h2>
              <ul class="grid gap-2.5 border-l-2 pl-4 text-sm text-muted-foreground">
                {#each item.points as point (point)}
                  <li>{point}</li>
                {/each}
              </ul>
            </div>
            <img class="w-full rounded-md border shadow-sm" src={asset(`/shots/${item.image}`)} width="1456" height="763" loading="lazy" alt={item.alt} />
          </div>
        </div>
      {/each}
    </section>

    <section id="examples" class="scroll-mt-12 border-b" aria-labelledby="examples-heading">
      <div class="wrap grid gap-8 py-12 lg:py-20">
        <div class="grid max-w-2xl gap-4">
          {@render eyebrow('Examples')}
          <h2 id="examples-heading" class="text-xl font-semibold tracking-tight text-balance">Preview a finished house before you draw your own.</h2>
          <p class="text-sm text-muted-foreground">
            Six example projects come with the app. Each opens here as a preview: the plan, the 3D model, the bill of
            quantities and the checks, with nothing to install and nothing saved. When one is close to what you want,
            open a copy and change it.
          </p>
        </div>
        <ul class="grid border-t text-sm">
          {#each EXAMPLES as example (example.id)}
            <li class="grid gap-x-6 gap-y-1 border-b py-3 md:grid-cols-[14rem_1fr_auto] md:items-baseline">
              <a class="font-medium underline-offset-4 hover:underline" href={exampleHref(example.id)}>{example.name}</a>
              <span class="text-muted-foreground">
                {example.place} · {example.highlights.join(' · ')}
              </span>
              <a class="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline" href={exampleHref(example.id)}>
                Preview<ArrowRight class="size-3.5" />
              </a>
            </li>
          {/each}
        </ul>
      </div>
    </section>

    <section class="border-b bg-muted/40" aria-labelledby="more-heading">
      <div class="wrap grid gap-8 py-12 lg:py-20">
        <div class="grid gap-4">
          {@render eyebrow('And the rest')}
          <h2 id="more-heading" class="text-xl font-semibold tracking-tight">Small things that add up.</h2>
        </div>
        <dl class="grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {#each more as item (item.name)}
            <div class="grid content-start gap-1 border-t pt-4">
              <dt class="text-sm font-semibold">{item.name}</dt>
              <dd class="text-sm text-muted-foreground">{item.text}</dd>
            </div>
          {/each}
        </dl>
      </div>
    </section>

    <section id="technology" class="scroll-mt-12 border-b" aria-labelledby="technology-heading">
      <div class="wrap grid gap-8 py-12 lg:py-20">
        <div class="grid gap-4">
          {@render eyebrow('Technology')}
          <h2 id="technology-heading" class="text-xl font-semibold tracking-tight">How it is built.</h2>
        </div>
        <dl class="grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {#each technology as item (item.name)}
            <div class="grid content-start gap-1 border-t pt-4">
              <dt class="text-sm font-semibold">{item.name}</dt>
              <dd class="text-sm text-muted-foreground">{item.text}</dd>
            </div>
          {/each}
        </dl>
      </div>
    </section>

    <section class="border-b bg-muted/40">
      <div class="wrap grid gap-6 py-12 lg:grid-cols-[1fr_auto] lg:items-center">
        <p class="max-w-3xl text-sm text-muted-foreground">
          Floorplan helps you think a design through and get a rough idea of its cost. It does not replace an architect,
          an engineer or plan approval. Rates are examples, not quotes, and the checks are a guide to SANS 10400 that
          must be confirmed against the standard.
        </p>
        <div class="flex flex-wrap gap-2">
          <Button href={app}>Open the app<ArrowRight /></Button>
          <Button variant="outline" href={start}>Start a new project</Button>
        </div>
      </div>
    </section>
  </main>

  <footer>
    <div class="wrap flex flex-wrap items-center justify-between gap-2 py-4 text-sm text-muted-foreground">
      <span>Floorplan</span>
      <a class="hover:text-foreground" href={REPO} rel="noreferrer">Source on GitHub</a>
    </div>
  </footer>
</div>

<style>
  /* The page's one column, and the two-part row most sections use: words in a narrow column on the left, a
     picture in a wide one on the right, both starting at the same height. */
  .wrap {
    width: 100%;
    max-width: 80rem;
    margin-inline: auto;
    padding-inline: 1.25rem;
  }

  .row {
    display: grid;
    gap: 2rem;
    align-items: start;
  }

  @media (min-width: 640px) {
    .wrap {
      padding-inline: 2rem;
    }
  }

  @media (min-width: 1024px) {
    .wrap {
      padding-inline: 3rem;
    }

    .row {
      grid-template-columns: minmax(0, 5fr) minmax(0, 8fr);
      gap: 3.5rem;
    }
  }
</style>
