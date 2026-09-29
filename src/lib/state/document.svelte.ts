import { fixtureDocument } from '../plot/fixture'
import type { Document, MutationResult } from '../model/types'
import * as mutations from '../model/mutations'

const HISTORY_CAP = 50

let document = $state<Document>(fixtureDocument())
let history: Document[] = []
let redoStack: Document[] = []

function snapshot(doc: Document): Document {
  return structuredClone($state.snapshot(doc))
}

function applyMutation(run: (doc: Document) => MutationResult): MutationResult {
  const before = snapshot(document)
  const result = run(structuredClone(before))
  if (result.ok) {
    history = [...history, before].slice(-HISTORY_CAP)
    redoStack = []
    document = result.document
  }
  return result
}

export function getDocument(): Document {
  return document
}

export function loadDocument(doc: Document): void {
  document = snapshot(doc)
  history = []
  redoStack = []
}

export function undo(): boolean {
  if (history.length === 0) return false
  const prev = history[history.length - 1]
  history = history.slice(0, -1)
  redoStack = [...redoStack, snapshot(document)]
  document = prev
  return true
}

export function redo(): boolean {
  if (redoStack.length === 0) return false
  const next = redoStack[redoStack.length - 1]
  redoStack = redoStack.slice(0, -1)
  history = [...history, snapshot(document)]
  document = next
  return true
}

export const documentStore = {
  get document() {
    return document
  },
  loadDocument,
  undo,
  redo,
  addCorner: (...args: Parameters<typeof mutations.addCorner> extends [Document, ...infer R] ? R : never) =>
    applyMutation((doc) => mutations.addCorner(doc, ...args)),
  addWall: (...args: Parameters<typeof mutations.addWall> extends [Document, ...infer R] ? R : never) =>
    applyMutation((doc) => mutations.addWall(doc, ...args)),
  moveCorner: (
    ...args: Parameters<typeof mutations.moveCorner> extends [Document, ...infer R] ? R : never
  ) => applyMutation((doc) => mutations.moveCorner(doc, ...args)),
  moveCorners: (
    ...args: Parameters<typeof mutations.moveCorners> extends [Document, ...infer R] ? R : never
  ) => applyMutation((doc) => mutations.moveCorners(doc, ...args)),
  rotateCorners: (
    ...args: Parameters<typeof mutations.rotateCorners> extends [Document, ...infer R] ? R : never
  ) => applyMutation((doc) => mutations.rotateCorners(doc, ...args)),
  addOpening: (
    ...args: Parameters<typeof mutations.addOpening> extends [Document, ...infer R] ? R : never
  ) => applyMutation((doc) => mutations.addOpening(doc, ...args)),
  updateOpening: (
    ...args: Parameters<typeof mutations.updateOpening> extends [Document, ...infer R] ? R : never
  ) => applyMutation((doc) => mutations.updateOpening(doc, ...args)),
  setOpeningAligned: (
    ...args: Parameters<typeof mutations.setOpeningAligned> extends [Document, ...infer R] ? R : never
  ) => applyMutation((doc) => mutations.setOpeningAligned(doc, ...args)),
  addStorey: (floorId: string, cornerId?: string) =>
    applyMutation((doc) => mutations.addStorey(doc, floorId, cornerId)),
  removeTopStorey: (unitId: string) => applyMutation((doc) => mutations.removeTopStorey(doc, unitId)),
  removeWall: (floorId: string, wallId: string) =>
    applyMutation((doc) => mutations.removeWall(doc, floorId, wallId)),
  removeOpening: (floorId: string, wallId: string, openingId: string) =>
    applyMutation((doc) => mutations.removeOpening(doc, floorId, wallId, openingId)),
  replacePlot: (plot: Parameters<typeof mutations.replacePlot>[1]) =>
    applyMutation((doc) => mutations.replacePlot(doc, plot)),
  replaceHeightfield: (heightfield: Parameters<typeof mutations.replaceHeightfield>[1]) =>
    applyMutation((doc) => mutations.replaceHeightfield(doc, heightfield)),
  setRoomFinish: (
    ...args: Parameters<typeof mutations.setRoomFinish> extends [Document, ...infer R] ? R : never
  ) => applyMutation((doc) => mutations.setRoomFinish(doc, ...args)),
  setRoof: (
    ...args: Parameters<typeof mutations.setRoof> extends [Document, ...infer R] ? R : never
  ) => applyMutation((doc) => mutations.setRoof(doc, ...args)),
}
