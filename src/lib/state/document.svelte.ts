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

function bind<Args extends unknown[]>(
  mutate: (document: Document, ...args: Args) => MutationResult,
): (...args: Args) => MutationResult {
  return (...args) => applyMutation((doc) => mutate(doc, ...args))
}

export const documentStore = {
  get document() {
    return document
  },
  loadDocument,
  undo,
  redo,
  addCorner: bind(mutations.addCorner),
  addWall: bind(mutations.addWall),
  addWallRing: bind(mutations.addWallRing),
  moveCorner: bind(mutations.moveCorner),
  moveCorners: bind(mutations.moveCorners),
  rotateCorners: bind(mutations.rotateCorners),
  addOpening: bind(mutations.addOpening),
  updateOpening: bind(mutations.updateOpening),
  setOpeningAligned: bind(mutations.setOpeningAligned),
  addStorey: bind(mutations.addStorey),
  removeTopStorey: bind(mutations.removeTopStorey),
  removeWall: bind(mutations.removeWall),
  removeOpening: bind(mutations.removeOpening),
  replacePlot: bind(mutations.replacePlot),
  replaceHeightfield: bind(mutations.replaceHeightfield),
  setRoomFinish: bind(mutations.setRoomFinish),
  setRoof: bind(mutations.setRoof),
  setWallSystem: bind(mutations.setWallSystem),
  setDefaultWallSystem: bind(mutations.setDefaultWallSystem),
  setProjectDefaults: bind(mutations.setProjectDefaults),
  setFence: bind(mutations.setFence),
  setSupport: bind(mutations.setSupport),
  setRate: bind(mutations.setRate),
  nameCell: bind(mutations.nameCell),
  joinCell: bind(mutations.joinCell),
  leaveCell: bind(mutations.leaveCell),
  updateSpace: bind(mutations.updateSpace),
  addStair: bind(mutations.addStair),
  updateStair: bind(mutations.updateStair),
  removeStair: bind(mutations.removeStair),
  setAssumption: bind(mutations.setAssumption),
}
