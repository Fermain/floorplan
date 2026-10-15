import { describe, expect, it } from 'vitest'
import { BUILDING_TOOLS, isToolInScope, SITE_TOOLS, scopeForTool } from './scope'

describe('plan scope partitioning', () => {
  it('partitions tools into building and site scopes', () => {
    expect(BUILDING_TOOLS).toContain('select')
    expect(BUILDING_TOOLS).toContain('draw-double')
    expect(BUILDING_TOOLS).toContain('draw-logical')
    expect(BUILDING_TOOLS).toContain('draw-stair')
    expect(BUILDING_TOOLS).toContain('draw-counter')
    expect(BUILDING_TOOLS).toContain('draw-fixture')

    expect(SITE_TOOLS).toContain('select')
    expect(SITE_TOOLS).toContain('draw-paving')
    expect(SITE_TOOLS).toContain('draw-bed')
    expect(SITE_TOOLS).toContain('draw-carport')
    expect(SITE_TOOLS).toContain('draw-retaining')

    // Building tools should not contain site-only tools
    expect(BUILDING_TOOLS).not.toContain('draw-paving')
    expect(BUILDING_TOOLS).not.toContain('draw-bed')
    expect(BUILDING_TOOLS).not.toContain('draw-carport')
    expect(BUILDING_TOOLS).not.toContain('draw-retaining')

    // Site tools should not contain building-only tools
    expect(SITE_TOOLS).not.toContain('draw-double')
    expect(SITE_TOOLS).not.toContain('draw-logical')
    expect(SITE_TOOLS).not.toContain('draw-stair')
    expect(SITE_TOOLS).not.toContain('draw-counter')
    expect(SITE_TOOLS).not.toContain('draw-fixture')
  })

  it('verifies tool presence in scope', () => {
    expect(isToolInScope('draw-double', 'building')).toBe(true)
    expect(isToolInScope('draw-double', 'site')).toBe(false)
    expect(isToolInScope('draw-paving', 'site')).toBe(true)
    expect(isToolInScope('draw-paving', 'building')).toBe(false)
    expect(isToolInScope('select', 'building')).toBe(true)
    expect(isToolInScope('select', 'site')).toBe(true)
  })

  it('determines scope from specific tool', () => {
    expect(scopeForTool('draw-paving')).toBe('site')
    expect(scopeForTool('draw-bed')).toBe('site')
    expect(scopeForTool('draw-carport')).toBe('site')
    expect(scopeForTool('draw-retaining')).toBe('site')

    expect(scopeForTool('draw-double')).toBe('building')
    expect(scopeForTool('draw-counter')).toBe('building')
    expect(scopeForTool('draw-fixture')).toBe('building')
    expect(scopeForTool('draw-stair')).toBe('building')

    expect(scopeForTool('select')).toBeNull()
  })
})
