import type { FixtureKind } from './types'

export type PortKind = 'waste' | 'cold' | 'hot'

// A pipe through the wall behind a fitting: sideways from the fitting's middle as you face it (left is negative),
// its centre's height above the finished floor, and the pipe's diameter. Typical South African positions, as a guide.
export type Port = { kind: PortKind; along: number; y: number; dia: number }

export const PORTS: Partial<Record<FixtureKind, Port[]>> = {
  wc: [
    { kind: 'waste', along: 0, y: 0.18, dia: 0.11 },
    { kind: 'cold', along: 0.15, y: 0.2, dia: 0.015 },
  ],
  basin: [
    { kind: 'waste', along: 0, y: 0.45, dia: 0.04 },
    { kind: 'hot', along: -0.1, y: 0.55, dia: 0.015 },
    { kind: 'cold', along: 0.1, y: 0.55, dia: 0.015 },
  ],
  sink: [
    { kind: 'waste', along: -0.19, y: 0.45, dia: 0.05 },
    { kind: 'hot', along: 0.05, y: 0.6, dia: 0.015 },
    { kind: 'cold', along: 0.2, y: 0.6, dia: 0.015 },
  ],
  // A shower drains through the floor; its mixer and rose come through the wall.
  shower: [
    { kind: 'hot', along: -0.08, y: 1.0, dia: 0.015 },
    { kind: 'cold', along: 0.08, y: 1.0, dia: 0.015 },
  ],
  bath: [
    { kind: 'waste', along: -0.7, y: 0.1, dia: 0.04 },
    { kind: 'hot', along: -0.68, y: 0.65, dia: 0.015 },
    { kind: 'cold', along: -0.53, y: 0.65, dia: 0.015 },
  ],
  'washing-machine': [
    { kind: 'waste', along: 0.15, y: 0.7, dia: 0.05 },
    { kind: 'cold', along: -0.15, y: 0.9, dia: 0.015 },
  ],
}

export const PORT_LABEL: Record<PortKind, string> = { waste: 'Waste', cold: 'Cold', hot: 'Hot' }
