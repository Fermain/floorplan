export type PlanScope = 'building' | 'site'

export type Tool =
  | 'draw-double'
  | 'draw-logical'
  | 'draw-rect'
  | 'draw-stair'
  | 'draw-fixture'
  | 'draw-paving'
  | 'draw-bed'
  | 'draw-carport'
  | 'draw-counter'
  | 'draw-retaining'
  | 'select'

export const BUILDING_TOOLS: readonly Tool[] = [
  'select',
  'draw-double',
  'draw-logical',
  'draw-rect',
  'draw-stair',
  'draw-counter',
  'draw-fixture',
]

export const SITE_TOOLS: readonly Tool[] = [
  'select',
  'draw-paving',
  'draw-bed',
  'draw-carport',
  'draw-retaining',
]

export function isToolInScope(tool: Tool, scope: PlanScope): boolean {
  return scope === 'building' ? BUILDING_TOOLS.includes(tool) : SITE_TOOLS.includes(tool)
}

export function scopeForTool(tool: Tool): PlanScope | null {
  if (tool === 'select') return null
  return SITE_TOOLS.includes(tool) ? 'site' : 'building'
}
