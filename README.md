# Floorplan

Brick-by-brick house design in the browser, priced and checked as you draw.

**[floorplan.ferma.in](https://floorplan.ferma.in)**

Floorplan is a design tool for small, low-cost houses in South Africa. You draw on a real-shaped, sloping plot. Walls are courses of real bricks and blocks, and the drawing gives you a bill of quantities and the SANS 10400 deemed-to-satisfy checks as you go. It runs entirely in your browser: there is no account, and your projects stay on your machine.

![A face-brick farmhouse with solar panels, a painted cottage and a carport, seen in the 3D Review](static/shots/review.jpg)

*Most of the pictures show the **Multi generation farmhouse**, one of the examples that come with the app: a face-brick family house between two painted cottages, with a double garage, two carports, solar panels, rainwater tanks, a septic tank and paving. Open a copy from the app's project list to look round it.*

> [!IMPORTANT]
> Floorplan helps you think through a design and get a rough idea of its cost. It does not replace an architect, an engineer or plan approval. Rates are examples, not quotes. The checks are a guide to SANS 10400 and must be confirmed against the standard.

## Contents

- [Where things are](#where-things-are)
- [A tour of the features](#a-tour-of-the-features)
- [Your data](#your-data)
- [Keyboard and mouse](#keyboard-and-mouse)
- [Known limits](#known-limits)
- [Running it locally](#running-it-locally)
- [How the code is organised](#how-the-code-is-organised)

## Where things are

- **[floorplan.ferma.in](https://floorplan.ferma.in)** is an introduction to the app.
- **[floorplan.ferma.in/app](https://floorplan.ferma.in/app)** is the app itself. It opens on your projects and the examples.

<img src="static/shots/home.jpg" alt="The project picker: projects and examples in one list, each with an estimate, and a preview of the one picked" width="100%">

The list shows your projects and the examples together, each with its estimated cost. Pick one to see its plan, plot and floor area beside the list; double-click or press Enter to open it. **Settings** has the switch for tips in the status bar and a backup of every project to one file.

## A tour of the features

### Start from a plot and a few defaults

**New project** is a short walkthrough:
1. Pick a sample plot, such as a level suburban stand or a steep north-facing slope, or bring your own boundary.
2. Choose what the walls are built from.
3. Choose the roof form, covering, pitch and eaves.
4. Set the standard window and door sizes.

These choices become the project defaults. You can change them later on the **Project** page, and each wall or roof can still differ. **Start with defaults** skips the walkthrough.

<p>
  <img src="docs/images/new-site.jpg" width="32%" alt="Sample plot cards with contour thumbnails">
  <img src="docs/images/new-walls.jpg" width="32%" alt="Wall system cards with brick and block swatches and costs per square metre">
  <img src="docs/images/new-roof.jpg" width="32%" alt="Roof form and covering choices">
</p>

### Walls made of real units

A wall is a stack of courses, not a line with a thickness. Six wall systems are built in, each with its own unit size, course height, leaf thickness and cavity:

| System | Unit | Typical use |
| --- | --- | --- |
| Clay brick cavity | 222 × 106 × 73 | External walls |
| Clay brick solid 220 | 222 × 106 × 73 | External or load-bearing walls |
| Clay brick half 110 | 222 × 106 × 73 | Internal partitions |
| Maxi brick 140 | 290 × 140 × 90 | External walls, low-cost housing |
| Concrete block 140 | 390 × 140 × 190 | External walls, low-cost housing |
| Concrete block 90 | 390 × 90 × 190 | Internal partitions |

Openings snap to whole courses and to the half-unit, so cut units are counted rather than guessed.

### Plan

<img src="static/shots/plan.jpg" alt="Plan of three houses, two carports and a garage round a gravel yard, with named rooms, floor finishes and paving" width="100%">

- **Drawing:** click corner to corner to draw walls, or tap Shift to draw a rectangle. A new wall becomes the grid reference, so the next one lines up with it.
- **Rooms:** they form wherever walls close, and each shows its net area. Name them and give them a type, such as bedroom, kitchen or bathroom. Rooms can be grouped, so an open-plan living and dining area counts as one. Each room's floor finish (screed, tiles, timber, vinyl or carpet) is drawn to scale.
- **Several buildings:** a plot can hold more than one building, each with its own storeys and roof.
- **Fittings:** sockets, switches, lights, sanitary ware, geysers, gas appliances and bottles, and rainwater tanks. A room can be fitted out in one step, and tanks snap under downpipes.
- **Paving:** driveways, paths and patios are drawn on the ground as rectangles or outlines, in concrete, cement or clay pavers, gravel or grass blocks. An apron round the house is a project setting.
- **Counters:** kitchen counters drawn along the inside face of a wall, and islands and bars standing free, with a choice of worktop and cupboards on the wall above. **Lay out this room** on a room's panel closes the plan in on that room and veils the rest.
- **Retaining walls:** drawn point to point along the foot of a bank, in retaining blocks, brick or concrete. What each holds back is read from the ground as it lies; the ground itself is not reshaped. Over a metre is flagged as needing an engineer.
- **Carports:** a roof on posts, standing free, for one, two or three cars, under steel sheeting or shade cloth. R turns it before you place it, and its corners snap to the house, the plot and paving.
- **Road access:** mark which sides of the plot face a street.
- **Logical walls:** these divide or close off a space without building anything. They can carry a fence or supports, and a roof may rest on them.
- **Storeys:** add up to four. Each upper storey stands only on the rooms enclosed below it, so a roof or a floor never floats over open ground.
- **Stairs:** the Stair tool shows the whole flight, laid out to SANS 10400 Part M. It sits flush against a wall face, side-on or end-on, and tucks into corners. R turns it round.
- **Navigation:** the plan is drawn north up. You can pan, zoom, and turn it with the compass dial to line up with the building.

<p>
  <img src="docs/images/plan-upper.jpg" width="49%" alt="Upper storey with walled bedrooms and a balcony enclosed by logical walls">
  <img src="docs/images/plan-stair.jpg" width="49%" alt="A ghost stair snapped against a hall wall with its size in the status line">
</p>

### Focus: one wall, face-on

Double-click a wall to open it as a flat elevation. Place and size windows and doors on the courses, read the dimension chain, and see the count of whole and cut units, openings and lintels change as you work. You can change a wall's system here too.

Each face of a wall is left exposed, bagged or plastered, and plastered and bagged faces take a paint colour. The project sets the finish outside and inside, and any face can differ. Skirting, cornice, fittings and gutters are set here as well.

On a logical wall, Focus is where you choose what gets built along it:
- **Fences:** steel palisade, welded mesh, precast concrete, timber slats or a low plastered half wall, at any height from 300 to 3000 mm.
- **Supports:** a classical precast column, a pier in the project's own block, a steel post or a treated timber pole, at a spacing you set.

<p>
  <img src="static/shots/focus.jpg" width="49%" alt="A plastered and painted cottage wall in Focus with a window and its dimension chain">
  <img src="docs/images/focus-balcony.jpg" width="49%" alt="Balcony edge in Focus with classical columns and a palisade balustrade">
</p>

### Roofs

Roofs come in hip, gable or mono-pitch forms, covered in concrete tiles, clay tiles, IBR or corrugated sheeting. They have real thickness and eaves. Gable ends are built up in the same block as the wall beneath, cut to the roof line. On the plan, the roof shows its ridges and hips.

<img src="static/shots/plan-site.jpg" alt="Site plan of the farm stand with its buildings, drive, yard and the road along one side" width="100%">

### Review: the 3D model and the sun

Review shows the design on its terrain, levelled under each building, with fences following the ground. Switch between midsummer and midwinter and move the time of day in SAST to see where the sun and shadows fall for the plot's latitude.

Moving in close cuts the building open in front of the camera, so you can see inside. Walls can also be cut to half height or hidden, and the storeys above a chosen one lifted off. Click a wall to open it in Focus, or a fitting to change it.

<img src="static/shots/review-farm.jpg" alt="Three houses, a garage and carports on a sloping stand, with the road behind" width="100%">

<p>
  <img src="docs/images/review-street.jpg" width="32%" alt="Street view through the palisade fence">
  <img src="docs/images/review-carport.jpg" width="32%" alt="Carport with an IBR mono-pitch roof on steel posts">
  <img src="docs/images/review-winter.jpg" width="32%" alt="Winter afternoon with long shadows on the south side">
</p>

### Quantities

The **Quantities** page counts materials straight from the drawing:
- Bricks and blocks, whole, cut and in gables, plus waste.
- Mortar as cement bags and sand.
- Lintels by stock length, and windows and doors by size.
- Surface bed, strip footings, suspended slabs and stairs in concrete.
- Floor finishes, plaster, bagging and paint, roof covering (with a tile count), supports, pad footings and fencing.
- Electrical, plumbing and gas: cable, conduit, boards, pipes, fittings and chases.
- Paving by area, with the layers under it and its edging.

The page is a sheet. Type your own rate over any example rate; Enter and the arrow keys move down and up the column. The assumptions behind the numbers (waste, mortar allowance, mix, footing size) sit beside it. Download the sheet as CSV.

<img src="static/shots/quantities.jpg" alt="The quantities sheet: masonry, mortar and lintel lines with rates, amounts and an estimated total" width="100%">

### Checks

The **Checks** page measures each habitable room against SANS 10400 deemed-to-satisfy rules:
- Daylight (Part O).
- Ventilation (Part O).
- Floor area and width (Part C).
- The whole building's glazing-to-floor ratio against the Part XA threshold for a fenestration calculation.

It also lays out the services from the fittings on the plan, as a guide for the trades:
- **Electrical:** circuits, breakers, cable sizes and the board.
- **Load shedding and solar:** tick the circuits to keep on and it sizes an inverter, a battery and the panels on the sunnier roof faces.
- **Plumbing:** the drain's fall to the sewer or septic tank, the water main, hot water runs and the rainwater a roof yields.
- **Gas:** appliances, pipe runs and the bottles' clearances.
- **Wall finishes:** single-leaf outside walls left exposed to the rain.

Each section says how many things it has to attend to and lists them first.

While you draw, the plan also warns about:
- Upper walls that don't land on a wall below.
- Straight walls longer than 8 m, which want a movement joint.
- Rooms that fall short.

<img src="static/shots/checks.jpg" alt="The Checks page: each room's daylight, ventilation, floor area and width against the minimum, with a list of sections beside it" width="100%">

## Your data

- **Storage:** projects save automatically in your browser's storage as you work, and appear in the project list. Clearing site data removes them, so keep a backup of anything you want to keep.
- **Backup:** **Settings** in the project list writes every project to one file, and restores from one, adding the projects beside those already there.
- **Download:** the project menu can export the plan as SVG or download the whole project as a JSON file. **Open file** in the project list loads a project file back in.
- **Import:** on the Project page you can bring in a plot boundary (GeoJSON or KML, in metres) and ground levels (a heightfield JSON file). You can also set the latitude, longitude and north bearing used for the sun.

Nothing is sent to a server.

## Keyboard and mouse

| Action | Keys |
| --- | --- |
| Undo / redo | ⌘Z / ⇧⌘Z (Ctrl on Windows and Linux), or ⌘Y |
| Save now | ⌘S |
| Rectangle while drawing walls | Tap Shift |
| Pan the plan | Hold Space and drag |
| Zoom the plan | ⌘ + scroll |
| Turn the plan | Drag the compass dial; ← → in 15° steps |
| Turn a stair before placing it | R |
| Delete the selected wall or stair | Delete or Backspace |
| Open a wall in Focus | Double-click it |
| Leave Focus or cancel a drawing | Esc |

## Known limits

- **Straight walls:** a building has up to four storeys, and walls are straight.
- **Fixed storey height:** it's 2.4 m, so parapets and double-height spaces can't be drawn yet.
- **Placed stairs:** they can be turned or deleted, but not dragged.
- **Not yet counted:** foundations below the footing, reinforcement and roof timbers. Labour is counted only for painting.
- **Services are indicative:** circuits, pipes and gas runs are laid out as a guide to cost. Registered electricians, plumbers and gas installers design and certify the real thing.
- **Sample data:** the sample plots are made up. Real cadastral and elevation data has to be imported as files.

## Running it locally

You need Node 22 or later and [pnpm](https://pnpm.io).

```sh
pnpm install
pnpm dev        # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `pnpm check` | Type-checks Svelte and TypeScript |
| `pnpm lint` | Runs ESLint |
| `pnpm test` | Runs the Vitest suite |
| `pnpm build` | Builds the static site into `build/` |

Pull requests run `check`, `lint`, `test` and `build` in GitHub Actions. Merges to `main` deploy to GitHub Pages at floorplan.ferma.in.

## How the code is organised

It's a SvelteKit single-page app (Svelte 5 runes, static adapter). The 3D views use [Threlte](https://threlte.xyz) and three.js, and the interface uses [shadcn-svelte](https://www.shadcn-svelte.com) on Tailwind.

| Path | Holds |
| --- | --- |
| `src/routes` | The introduction at `/`, and the app under `/app`: the project list, new project, and each project's Plan, Focus, Review, Quantities, Checks and Project |
| `static/shots` | Screenshots used by the introduction and this README |
| `src/view` | The large editors: `plan`, `elevation` (Focus), `review` and `quantities` |
| `src/lib/model` | The document types and every edit, as pure functions that return a new document or a reason for refusing |
| `src/lib/geometry` | Walls, openings, rooms, slabs, roofs, gables, stairs, fences, supports, paving, finishes, services, terrain and SANS checks |
| `src/lib/examples` | The example projects, most of them built in code through the same edits a person makes |
| `src/lib/cost` | The quantity takeoff and example rates |
| `src/lib/plot` | Sample plots and GeoJSON, KML and heightfield import |
| `src/lib/solar` | Sun position for the Review lighting |
| `src/lib/state` | The live document with undo and redo, and autosave to IndexedDB |
| `src/lib/components` | Shared interface pieces, including shadcn components under `ui` |

Edits go through the functions in `src/lib/model/mutations.ts` and are validated there, so the views never build documents by hand. Most geometry and model modules have tests next to them.
