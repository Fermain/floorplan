export type Plot = {
  ring: [number, number][]
  northBearingDeg: number
  latitude: number
  longitude: number
  // The sides of the plot on a road, by edge: edge i runs from ring[i] to ring[i + 1].
  roads?: number[]
}

export type Heightfield = {
  originX: number
  originZ: number
  cellSize: number
  cols: number
  rows: number
  heights: number[]
}

export type Corner = {
  id: string
  x: number
  z: number
  unitId?: string
}

export type OpeningKind = 'window' | 'door' | 'external-door' | 'internal-door' | 'garage' | 'portal'

export type Opening = {
  id: string
  u: number
  v: number
  width: number
  height: number
  kind: OpeningKind
  aligned: boolean
}

export type WallSkin = 'single' | 'double' | 'logical'

export type WallSystemId = 'clay-cavity' | 'clay-solid' | 'clay-single' | 'maxi-140' | 'block-140' | 'block-90'

export type FenceType = 'palisade' | 'mesh' | 'precast' | 'timber' | 'half-wall'

export type Fence = {
  type: FenceType
  height: number
}

export type SupportType = 'column' | 'pier' | 'steel' | 'pole'

export type Support = {
  type: SupportType
  spacing: number
}

export type SkirtingType = 'rounded' | 'square' | 'angled'
export type CorniceType = 'rounded' | 'coral'

// How a face of a wall is finished: left as built, bagged with a thin slurry, or plastered ("dagga").
export type WallFinish = 'exposed' | 'bagged' | 'plastered'

// A face's own finish and paint (a colour from the palette, or 'none'); anything left out follows the project.
export type FaceFinish = { finish?: WallFinish; paint?: string }

// What runs along one face of a wall inside a room; anything left out follows the project default.
export type FaceTrim = { skirting?: SkirtingType | 'none'; cornice?: CorniceType | 'none' }

export type Wall = {
  id: string
  startCornerId: string
  endCornerId: string
  skin: WallSkin
  systemId?: WallSystemId
  fence?: Fence
  support?: Support
  // front is the face on side 1 of the wall, back the face on side -1.
  trim?: { front?: FaceTrim; back?: FaceTrim }
  finish?: { front?: FaceFinish; back?: FaceFinish }
  openings: Opening[]
}

export type RoomType =
  | 'living'
  | 'bedroom'
  | 'kitchen'
  | 'dining'
  | 'bathroom'
  | 'toilet'
  | 'study'
  | 'passage'
  | 'laundry'
  | 'garage'
  | 'store'
  | 'deck'
  | 'other'

export type FloorFinish = 'screed' | 'tiles' | 'timber' | 'vinyl' | 'carpet' | 'none'

export type Space = {
  id: string
  name: string
  type: RoomType
  finish: FloorFinish
  seeds: { x: number; z: number }[]
  // Open to the sky: a deck or a yard. No roof, ceiling or storey goes over it, though it is part of the house.
  open?: boolean
}

export type Stair = {
  id: string
  x: number
  z: number
  dx: number
  dz: number
  width: number
}

export type FixtureKind =
  | 'socket'
  | 'switch'
  | 'light'
  | 'outdoor-light'
  | 'stove-isolator'
  | 'extractor'
  | 'db-board'
  | 'wc'
  | 'basin'
  | 'shower'
  | 'bath'
  | 'sink'
  | 'washing-machine'
  | 'geyser'
  | 'solar-geyser'
  | 'outside-tap'
  | 'water-tank'
  | 'stove'
  | 'gas-stove'
  | 'gas-geyser'
  | 'gas-cylinder'

export type BottleSize = 9 | 19 | 48
export type TankLitres = 1000 | 2500 | 5000 | 10000

// (x, z) is the middle of the fixture's footprint, (dx, dz) the way it faces, y its underside above the finished floor.
export type Fixture = {
  id: string
  kind: FixtureKind
  x: number
  z: number
  dx: number
  dz: number
  y: number
  // Gas bottles only: how many stand in a row, their size, and whether a steel cage locks them in.
  bottles?: number
  bottleKg?: BottleSize
  cage?: boolean
  // Rainwater tanks only: how much the tank holds.
  litres?: TankLitres
  // Stoves only: a hob set into a worktop with an oven under it, rather than a stove standing in a gap.
  builtIn?: boolean
}

export type Floor = {
  id: string
  index: number
  datumHeight: number
  unitId?: string
  corners: Corner[]
  walls: Wall[]
  roomFinishes: Record<string, string>
  spaces?: Space[]
  stairs?: Stair[]
  fixtures?: Fixture[]
  counters?: Counter[]
  outline?: { x: number; z: number }[][]
  roof?: Roof
}

export type RoofForm = 'hip' | 'gable' | 'mono'

export type RoofCovering = 'concrete-tile' | 'clay-tile' | 'ibr' | 'corrugated'

export type GutterType = 'round-pvc' | 'square-metal'

export type Roof = {
  pitchDeg: number
  eaves: number
  form?: RoofForm
  turns?: number
  covering?: RoofCovering
  // Every eave gets a gutter of this type, except above the walls listed in noGutter.
  gutter?: GutterType
  noGutter?: string[]
}

// Hard surfaces on the ground round the house: driveways, paths, patios, and the apron along the walls.
export type PavingSurface = 'concrete' | 'cement-pavers' | 'clay-pavers' | 'gravel' | 'grass-blocks'

export type PavingArea = { id: string; ring: [number, number][]; surface: PavingSurface }

export type ProjectDefaults = {
  roofForm: RoofForm
  roofCovering: RoofCovering
  roofPitchDeg: number
  roofEaves: number
  windowWidth: number
  windowHeight: number
  sill: number
  doorHeight: number
  skirting: SkirtingType | 'none'
  cornice: CorniceType | 'none'
  // A strip laid round the outside of the house to throw water clear of the foundations; 0 for none.
  apronWidth: number
  apronSurface: PavingSurface
  // Wall finishes outside and in: 'auto' follows the wall, plastering block and leaving clay face brick outside.
  outsideFinish: WallFinish | 'auto'
  insideFinish: WallFinish | 'auto'
  outsidePaint: string
  insidePaint: string
}

export type Building = {
  floors: Floor[]
  wallSystemId?: WallSystemId
  defaults?: Partial<ProjectDefaults>
}

export type CostAssumptions = {
  wastePct: number
  mortarAllowancePct: number
  cementBagsPerM3: number
  sandM3PerM3: number
  footingWidth: number
  footingDepth: number
}

export type Costing = {
  rates?: Record<string, number>
  assumptions?: Partial<CostAssumptions>
}

export type ServiceKind = 'sewer' | 'water'

export type PlanPoint = { x: number; z: number }

// Where the plot's services connect on the boundary, and the bends in the pipes run to them outside.
export type SewerType = 'municipal' | 'septic'

export type SiteServices = {
  sewer?: PlanPoint
  water?: PlanPoint
  sewerDepth?: number
  // Off the municipal sewer the drain ends in a septic tank, which overflows to a soakaway.
  sewerType?: SewerType
  soakaway?: PlanPoint
  rainfallMm?: number
  // Load shedding: circuits kept on by the inverter, hours of backup, and solar panels on the roof.
  essential?: string[]
  backupHours?: number
  solarPanels?: number
  bends?: Partial<Record<ServiceKind, PlanPoint[]>>
}

// A run of kitchen counter: cupboards under a worktop. It is placed by the start of its back edge, the way it
// runs, and its length; its depth comes out to the left of the way it runs, so a counter drawn along a wall runs
// with the room on its left.
export type CounterKind = 'base' | 'island' | 'bar'
export type CounterTop = 'laminate' | 'granite' | 'timber'
export type Counter = {
  id: string
  x: number
  z: number
  dx: number
  dz: number
  length: number
  depth: number
  kind: CounterKind
  top: CounterTop
  // Cupboards on the wall above it.
  wallUnits?: boolean
}

// A carport: a roof on posts with no walls, standing free on the ground. It is placed by its middle and the way
// its cars drive in, and sized by how many cars it takes side by side.
export type CarportRoof = 'sheet' | 'shade-cloth'
export type Carport = {
  id: string
  x: number
  z: number
  // The unit direction cars drive in along.
  dx: number
  dz: number
  bays: 1 | 2 | 3
  roof: CarportRoof
}

// A retaining wall: a wall along a line on the ground that holds the higher ground on one side back from the
// lower ground on the other. How much it holds comes from the ground itself; the wall does not reshape it.
export type RetainingType = 'blocks' | 'masonry' | 'concrete'
export type RetainingWall = {
  id: string
  points: [number, number][]
  type: RetainingType
}

export type Document = {
  plot: Plot
  heightfield: Heightfield
  building: Building
  costing?: Costing
  services?: SiteServices
  paving?: PavingArea[]
  carports?: Carport[]
  retaining?: RetainingWall[]
  // The house as it stood when it was marked as built. With one, the project is an alteration to that house:
  // what is drawn is compared with it, and only the difference is priced.
  baseline?: Baseline
}

// The house as built: the whole project at the moment it was marked, and when that was.
export type Baseline = { at: number; document: Omit<Document, 'baseline'> }

export type DerivedRoom = {
  cornerIds: string[]
  signedArea: number
  finishId: string
}

export type MutationOk = { ok: true; document: Document }
export type MutationFail = { ok: false; document: Document; reason: string }
export type MutationResult = MutationOk | MutationFail
