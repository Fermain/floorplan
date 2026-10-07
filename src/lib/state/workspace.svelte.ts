// What is shared between the views and the menubar over them: how things are shown, and what the view that is
// open can be asked to do. A view keeps its own toolbar; the menubar reaches the same things through here.

export type CutawayChoice = 'none' | 'box-near' | 'box-deep' | 'cone'
export type WallsChoice = 'full' | 'half' | 'hidden'

export const CUTAWAY_CHOICES: { value: CutawayChoice; label: string }[] = [
  { value: 'none', label: 'No cutaway' },
  { value: 'box-near', label: 'Box cut' },
  { value: 'box-deep', label: 'Deep box cut' },
  { value: 'cone', label: 'Cone cut' },
]
export const WALLS_CHOICES: { value: WallsChoice; label: string }[] = [
  { value: 'full', label: 'Full walls' },
  { value: 'half', label: 'Half walls' },
  { value: 'hidden', label: 'No walls' },
]

// The tools of the plan, as the menubar lists them.
export const PLAN_TOOLS: { value: string; label: string; hint: string }[] = [
  { value: 'select', label: 'Select', hint: 'V' },
  { value: 'draw-double', label: 'Wall', hint: '' },
  { value: 'draw-logical', label: 'Logical wall', hint: '' },
  { value: 'draw-stair', label: 'Stair', hint: '' },
  { value: 'draw-fixture', label: 'Fittings', hint: '' },
  { value: 'draw-paving', label: 'Paving', hint: '' },
  { value: 'draw-carport', label: 'Carport', hint: '' },
  { value: 'draw-retaining', label: 'Retaining wall', hint: '' },
  { value: 'draw-counter', label: 'Counters', hint: '' },
]

// How the plan and the 3D model are shown. Kept for the visit, across views and projects.
export const view = $state({
  // Plan: what has changed from the house as built is picked out.
  showChanges: true,
  // Review: the services through the walls, the cutaway in front of the camera, and how the walls show.
  xray: false,
  cutaway: 'box-near' as CutawayChoice,
  walls: 'full' as WallsChoice,
  // Review: the top storey shown, by its index, or 'all' for the whole house.
  upTo: 'all',
  // Review: whether the roofs are on. Off, the house is open from above with every storey still in place.
  roofs: true,
})

// What the plan offers while it is open.
export type PlanHandle = {
  tool: () => string
  setTool: (tool: string) => void
  zoomBy: (factor: number) => void
  fit: () => void
  // What Delete would remove, if anything is picked.
  deletable: () => { label: string; run: () => void } | null
}

// What Focus offers while a wall is open in it.
export type FocusHandle = {
  mode: () => 'select' | 'place'
  setMode: (mode: 'select' | 'place') => void
  // Whether the wall is seen square on, or in perspective.
  square: () => boolean
  setSquare: (square: boolean) => void
  // Look at the other face, where the wall has one to look at; and go back to the plan.
  flip: (() => void) | null
  exit: (() => void) | null
}

let plan = $state<PlanHandle | null>(null)
let focus = $state<FocusHandle | null>(null)
// A tool asked for while the plan was not open: taken up when it opens.
let wanted: string | null = null

export const workspace = {
  get plan() {
    return plan
  },
  // The plan announces itself while it is on screen. Returns what to call when it leaves.
  openPlan(handle: PlanHandle): () => void {
    plan = handle
    if (wanted) {
      const tool = wanted
      wanted = null
      handle.setTool(tool)
    }
    return () => {
      if (plan === handle) plan = null
    }
  },
  get focus() {
    return focus
  },
  openFocus(handle: FocusHandle): () => void {
    focus = handle
    return () => {
      if (focus === handle) focus = null
    }
  },
  // Ask for a tool; if the plan is not open, it is taken up when it next opens.
  wantTool(tool: string): boolean {
    if (plan) {
      plan.setTool(tool)
      return true
    }
    wanted = tool
    return false
  },
}
