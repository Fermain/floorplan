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

export type Floor = {
  id: string
  index: number
  datumHeight: number
  unitId?: string
  corners: Corner[]
  walls: Wall[]
  roomFinishes: Record<string, string>
  outline?: { x: number; z: number }[][]
  roof?: Roof
}

export type Roof = {
  pitchDeg: number
  eaves: number
}

export type Building = {
  floors: Floor[]
  wallSystemId?: WallSystemId
}

export type Document = {
  plot: Plot
  heightfield: Heightfield
  building: Building
}

export type DerivedRoom = {
  cornerIds: string[]
  signedArea: number
  finishId: string
}

export type MutationOk = { ok: true; document: Document }
export type MutationFail = { ok: false; document: Document; reason: string }
export type MutationResult = MutationOk | MutationFail
