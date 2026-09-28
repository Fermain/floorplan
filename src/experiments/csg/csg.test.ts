/// <reference types="node" />
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { OPENING_COUNT, WALL_LENGTH_M, openingCenterX } from './params.js'
import { collectResults } from './timing.js'

const resultsPath = join(dirname(fileURLToPath(import.meta.url)), 'results.json')

describe('csg spike', () => {
  it('spaces openings without overlap', () => {
    const half = 0.28 / 2
    for (let i = 0; i < OPENING_COUNT - 1; i++) {
      const left = openingCenterX(i) + half
      const right = openingCenterX(i + 1) - half
      expect(right).toBeGreaterThan(left)
    }
    expect(openingCenterX(0) - half).toBeGreaterThan(0)
    expect(openingCenterX(OPENING_COUNT - 1) + half).toBeLessThan(WALL_LENGTH_M)
  })

  it('writes timing results', () => {
    const results = collectResults()
    for (const value of Object.values(results.medianMs)) {
      expect(value).toBeGreaterThan(0)
    }
    writeFileSync(resultsPath, `${JSON.stringify(results, null, 2)}\n`)
  })
})
