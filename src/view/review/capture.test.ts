import { describe, expect, it } from 'vitest'
import { PICTURE_QUALITIES, pictureSize } from './capture'

const [quick, fine] = PICTURE_QUALITIES

describe('the size of an exported picture', () => {
  it('is twice the screen for a quick one and 3840 wide for a fine one, in the shape of the view', () => {
    expect(pictureSize(quick, { width: 1200, height: 600 }, 16384)).toEqual({ width: 2400, height: 1200 })
    expect(pictureSize(fine, { width: 1200, height: 600 }, 16384)).toEqual({ width: 3840, height: 1920 })
  })

  it('is held to what the graphics card will draw in one piece, either way up', () => {
    expect(pictureSize(fine, { width: 1200, height: 600 }, 2048)).toEqual({ width: 2048, height: 1024 })
    // A tall view is limited by its height.
    expect(pictureSize(fine, { width: 600, height: 1200 }, 2048)).toEqual({ width: 1024, height: 2048 })
  })
})
