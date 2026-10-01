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

export type FenceType = 'palisade' | 'mesh' | 'precast' | 'timber'

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
  | 'other'

export type FloorFinish = 'screed' | 'tiles' | 'timber' | 'vinyl' | 'carpet' | 'none'

export type Space = {
  id: string
  name: string
  type: RoomType
  finish: FloorFinish
  seeds: { x: number; z: number }[]
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

export type Document = {
  plot: Plot
  heightfield: Heightfield
  building: Building
  costing?: Costing
  services?: SiteServices
}

export type DerivedRoom = {
  cornerIds: string[]
  signedArea: number
  finishId: string
}

export type MutationOk = { ok: true; document: Document }
export type MutationFail = { ok: false; document: Document; reason: string }
export type MutationResult = MutationOk | MutationFail
