export type Plot = {
  ring: [number, number][]
  northBearingDeg: number
  latitude: number
  longitude: number
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

export type Wall = {
  id: string
  startCornerId: string
  endCornerId: string
  skin: WallSkin
  systemId?: WallSystemId
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
  outline?: { x: number; z: number }[][]
  roof?: Roof
}

export type RoofForm = 'hip' | 'gable' | 'mono'

export type RoofCovering = 'concrete-tile' | 'clay-tile' | 'ibr' | 'corrugated'

export type Roof = {
  pitchDeg: number
  eaves: number
  form?: RoofForm
  turns?: number
  covering?: RoofCovering
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

export type Document = {
  plot: Plot
  heightfield: Heightfield
  building: Building
  costing?: Costing
}

export type DerivedRoom = {
  cornerIds: string[]
  signedArea: number
  finishId: string
}

export type MutationOk = { ok: true; document: Document }
export type MutationFail = { ok: false; document: Document; reason: string }
export type MutationResult = MutationOk | MutationFail
