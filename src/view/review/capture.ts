import { AmbientLight, DirectionalLight, HemisphereLight, type Camera, type Scene, PerspectiveCamera, OrthographicCamera, Vector2, Vector3, type WebGLRenderer } from 'three'

// A picture of the model as it stands in Review, better than the screen can afford to draw it live. The view is
// drawn many times at a large size, each time with the camera a fraction of a pixel aside, the sun a hair off its
// place and a share of the sky's light coming from somewhere new, and the drawings are averaged. That gives clean
// edges, shadows that soften away from what casts them, and shade in the corners the sky cannot see into.

export type PictureQuality = { id: 'quick' | 'fine'; name: string; text: string; width: number; samples: number }

export const PICTURE_QUALITIES: PictureQuality[] = [
  { id: 'quick', name: 'Quick', text: 'Twice the size of the screen, in a moment.', width: 0, samples: 12 },
  { id: 'fine', name: 'Fine, 4K', text: '3840 pixels wide, with soft shadows and shade in the corners. Takes ten seconds or so.', width: 3840, samples: 32 },
]

// How much of the sky's even light is taken away and given back from one direction at a time, with shadows.
const SKY_SHARE = 0.6
// How far the sun strays from its place, as a share of its distance: about the width of the sun and a little more.
const SUN_SPREAD = 0.012

// The n-th number of a low-discrepancy run: well-spread points without the clumps chance gives.
function halton(index: number, base: number): number {
  let result = 0
  let fraction = 1 / base
  let i = index
  while (i > 0) {
    result += fraction * (i % base)
    i = Math.floor(i / base)
    fraction /= base
  }
  return result
}

export function pictureSize(quality: PictureQuality, screen: { width: number; height: number }, limit: number): { width: number; height: number } {
  const aspect = screen.height / Math.max(1, screen.width)
  const wanted = quality.width > 0 ? quality.width : screen.width * 2
  // No wider than the graphics card will draw in one piece.
  const width = Math.round(Math.max(320, Math.min(wanted, limit, aspect > 0 ? limit / aspect : limit)))
  return { width, height: Math.max(1, Math.round(width * aspect)) }
}

export async function capturePicture(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  quality: PictureQuality,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const gl = renderer.getContext()
  const screen = renderer.getSize(new Vector2())
  const ratio = renderer.getPixelRatio()
  const limit = Math.min(8192, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number)
  const { width, height } = pictureSize(quality, { width: screen.x, height: screen.y }, limit)
  const samples = quality.samples

  // The lights as they are, to put back afterwards.
  const suns: DirectionalLight[] = []
  const evens: (AmbientLight | HemisphereLight)[] = []
  scene.traverse((object) => {
    if (object instanceof DirectionalLight && object.castShadow) suns.push(object)
    else if (object instanceof AmbientLight || object instanceof HemisphereLight) evens.push(object)
  })
  const sun = suns[0]
  const kept = {
    sunAt: sun?.position.clone(),
    mapSize: sun?.shadow.mapSize.clone(),
    evens: evens.map((light) => light.intensity),
  }
  let dome: DirectionalLight | null = null
  const fine = samples >= 24

  try {
    renderer.setPixelRatio(1)
    renderer.setSize(width, height, false)
    if (sun && fine) {
      // Sharper shadows from the sun, and a light to stand for the sky, thrown from a new place each time.
      sun.shadow.mapSize.set(4096, 4096)
      sun.shadow.map?.dispose()
      sun.shadow.map = null
      const even = evens.reduce((sum, light) => sum + light.intensity, 0)
      for (const light of evens) light.intensity *= 1 - SKY_SHARE
      // One direction's worth of an even sky: a level surface gets two thirds of it on average.
      dome = new DirectionalLight('#cfe0f2', even * SKY_SHARE * 1.5)
      dome.castShadow = true
      dome.shadow.mapSize.set(2048, 2048)
      dome.shadow.bias = sun.shadow.bias
      dome.shadow.normalBias = sun.shadow.normalBias * 2
      const from = sun.shadow.camera
      Object.assign(dome.shadow.camera, { left: from.left, right: from.right, top: from.top, bottom: from.bottom, near: from.near, far: from.far })
      dome.shadow.camera.updateProjectionMatrix()
      dome.target = sun.target
      scene.add(dome)
    }

    const pixels = new Uint8Array(width * height * 4)
    const sum = new Uint16Array(width * height * 4)
    const distance = sun && kept.sunAt ? kept.sunAt.distanceTo(sun.target.position) : 0
    const toSun = sun && kept.sunAt ? kept.sunAt.clone().sub(sun.target.position).normalize() : new Vector3(0, 1, 0)
    const side = new Vector3().crossVectors(toSun, Math.abs(toSun.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0)).normalize()
    const over = new Vector3().crossVectors(toSun, side)
    const viewable = camera instanceof PerspectiveCamera || camera instanceof OrthographicCamera

    for (let i = 0; i < samples; i++) {
      const [a, b, c, d] = [halton(i + 1, 2), halton(i + 1, 3), halton(i + 1, 5), halton(i + 1, 7)]
      if (viewable) camera.setViewOffset(width, height, a - 0.5, b - 0.5, width, height)
      if (sun && kept.sunAt && fine) {
        // The sun, somewhere on its own disc.
        const r = Math.sqrt(c) * SUN_SPREAD * distance
        sun.position.copy(kept.sunAt).addScaledVector(side, r * Math.cos(d * Math.PI * 2)).addScaledVector(over, r * Math.sin(d * Math.PI * 2))
      }
      if (dome && sun) {
        // The sky, from a direction picked so that overhead counts for more than the horizon, as it does.
        const up = Math.sqrt(1 - a)
        const round = Math.sqrt(a)
        const turn = b * Math.PI * 2
        dome.position.copy(sun.target.position).add(new Vector3(round * Math.cos(turn), Math.max(0.08, up), round * Math.sin(turn)).multiplyScalar(distance))
      }
      renderer.render(scene, camera)
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      for (let k = 0; k < pixels.length; k++) sum[k] += pixels[k]
      onProgress?.(i + 1, samples)
      // Let the page draw its progress, and stay answerable, between one drawing and the next.
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    // The average, turned the right way up: the graphics card counts its rows from the bottom.
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser cannot make the picture.')
    const image = context.createImageData(width, height)
    const row = width * 4
    for (let y = 0; y < height; y++) {
      const from = (height - 1 - y) * row
      const to = y * row
      for (let x = 0; x < row; x += 4) {
        image.data[to + x] = Math.round(sum[from + x] / samples)
        image.data[to + x + 1] = Math.round(sum[from + x + 1] / samples)
        image.data[to + x + 2] = Math.round(sum[from + x + 2] / samples)
        image.data[to + x + 3] = 255
      }
    }
    context.putImageData(image, 0, 0)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The picture could not be saved.'))), 'image/png'))
  } finally {
    if (camera instanceof PerspectiveCamera || camera instanceof OrthographicCamera) camera.clearViewOffset()
    if (dome) {
      scene.remove(dome)
      dome.shadow.map?.dispose()
      dome.dispose()
    }
    if (sun && kept.sunAt && kept.mapSize) {
      sun.position.copy(kept.sunAt)
      if (!sun.shadow.mapSize.equals(kept.mapSize)) {
        sun.shadow.mapSize.copy(kept.mapSize)
        sun.shadow.map?.dispose()
        sun.shadow.map = null
      }
    }
    evens.forEach((light, i) => (light.intensity = kept.evens[i]))
    renderer.setPixelRatio(ratio)
    renderer.setSize(screen.x, screen.y, false)
  }
}
