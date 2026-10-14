import type { Gate, GateOpening } from './types'

export const GATE_MIN_WIDTH_M = 0.6
export const GATE_MAX_WIDTH_M = 6
// Fence left between a gate and the end of the line, or another gate, for a post to hang it from.
export const GATE_POST_CLEAR_M = 0.15
// Wider than this, a swinging gate is a pair of leaves meeting in the middle.
export const GATE_PAIR_OVER_M = 1.5

export type GatePreset = { id: string; name: string; text: string; width: number; opening: GateOpening }

export const GATE_PRESETS: readonly GatePreset[] = [
  { id: 'pedestrian', name: 'Gate', text: 'A single gate for people, 1 m wide, swinging on hinges.', width: 1, opening: 'swing' },
  { id: 'driveway', name: 'Driveway gates', text: 'A pair of gates for cars, 3.6 m across, swinging open from the middle.', width: 3.6, opening: 'swing' },
  { id: 'sliding', name: 'Sliding gate', text: 'One gate for cars, 3.6 m wide, running back along the fence on a track.', width: 3.6, opening: 'sliding' },
]

export function gateLeaves(gate: Pick<Gate, 'width' | 'opening'>): number {
  return gate.opening === 'swing' && gate.width > GATE_PAIR_OVER_M + 1e-9 ? 2 : 1
}

// What a gate is called, by how it opens and how many leaves it has.
export function gateName(gate: Pick<Gate, 'width' | 'opening'>): string {
  if (gate.opening === 'sliding') return 'Sliding gate'
  return gateLeaves(gate) === 2 ? 'Pair of swing gates' : 'Gate'
}

// Why a fence's gates cannot stand as they are on a line of this length, if they cannot.
export function gatesProblem(gates: Gate[], length: number): string | null {
  const sorted = [...gates].sort((a, b) => a.u - b.u)
  let reached = 0
  for (const gate of sorted) {
    if (gate.opening !== 'swing' && gate.opening !== 'sliding') return 'unknown gate'
    if (!(gate.width >= GATE_MIN_WIDTH_M - 1e-9 && gate.width <= GATE_MAX_WIDTH_M + 1e-9)) return 'gate width out of range'
    if (gate.u < reached + GATE_POST_CLEAR_M - 1e-9) return 'gates need room for a post between them and the end of the fence'
    reached = gate.u + gate.width
  }
  if (sorted.length > 0 && reached > length - GATE_POST_CLEAR_M + 1e-9) return 'gates need room for a post between them and the end of the fence'
  return null
}

// The lengths of fence between a line's gates, as distances along it, leaving out any gate that no longer fits.
export function fenceRuns(gates: Gate[] | undefined, length: number): { runs: [number, number][]; gates: Gate[] } {
  const fitting: Gate[] = []
  let reached = 0
  for (const gate of [...(gates ?? [])].sort((a, b) => a.u - b.u)) {
    if (gate.u < reached + GATE_POST_CLEAR_M - 1e-9 || gate.u + gate.width > length - GATE_POST_CLEAR_M + 1e-9) continue
    fitting.push(gate)
    reached = gate.u + gate.width
  }
  const runs: [number, number][] = []
  let from = 0
  for (const gate of fitting) {
    runs.push([from, gate.u])
    from = gate.u + gate.width
  }
  runs.push([from, length])
  return { runs, gates: fitting }
}
