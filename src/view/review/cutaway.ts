import { Material, Mesh, MeshBasicMaterial, MeshDepthMaterial, MeshStandardMaterial, Object3D, RGBADepthPacking, Vector3, type IUniform } from 'three'

// A cone led out from the camera along the view: anything of the building inside it is not drawn. Zoomed out, the
// cone ends in the air and the house is whole; close in, it cuts away the walls and roof between you and the room.
// Each mesh may also carry a height above which it is cut, for walls cut off at waist height.

// How the walls show: whole, cut off at waist height, or not at all.
export type WallView = 'full' | 'half' | 'hidden'

export const cut = {
  origin: { value: new Vector3() },
  direction: { value: new Vector3(0, 0, -1) },
  length: { value: 0 },
  nearRadius: { value: 0.4 },
  farRadius: { value: 3 },
}

// Above any building: nothing is cut by height.
export const NO_CUT_HEIGHT = 1e6

const VERTEX_HEAD = 'varying vec3 vCutWorld;\n'
const FRAGMENT_HEAD = `varying vec3 vCutWorld;
uniform vec3 cutOrigin;
uniform vec3 cutDirection;
uniform float cutLength;
uniform float cutNearRadius;
uniform float cutFarRadius;
uniform float cutAbove;
`
const CUT_TEST = `
  {
    vec3 cutRel = vCutWorld - cutOrigin;
    float cutT = dot(cutRel, cutDirection);
    if (cutLength > 0.0 && cutT > 0.0 && cutT < cutLength) {
      float cutR = mix(cutNearRadius, cutFarRadius, cutT / cutLength);
      if (length(cutRel - cutDirection * cutT) < cutR) discard;
    }
    if (vCutWorld.y > cutAbove) discard;
  }
`

type Cuttable = Material & { userData: { cutAbove?: IUniform<number> } }

// Teach a material to discard what the cone or the cut height takes away.
function patch(material: Cuttable): IUniform<number> {
  const above: IUniform<number> = { value: NO_CUT_HEIGHT }
  material.userData.cutAbove = above
  material.onBeforeCompile = (shader) => {
    shader.uniforms.cutOrigin = cut.origin
    shader.uniforms.cutDirection = cut.direction
    shader.uniforms.cutLength = cut.length
    shader.uniforms.cutNearRadius = cut.nearRadius
    shader.uniforms.cutFarRadius = cut.farRadius
    shader.uniforms.cutAbove = above
    shader.vertexShader = VERTEX_HEAD + shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vCutWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = FRAGMENT_HEAD + shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>${CUT_TEST}`)
  }
  material.needsUpdate = true
  return above
}

const patched = new WeakMap<Material, IUniform<number>>()

// The height a mesh is cut at: its own, or the nearest set on a group above it.
function cutHeightOf(object: Object3D): number {
  for (let at: Object3D | null = object; at; at = at.parent) {
    if (typeof at.userData.cutAbove === 'number') return at.userData.cutAbove
  }
  return NO_CUT_HEIGHT
}

// Patch the building's meshes as they appear, and keep each one's cut height current. Meshes marked keepWhole,
// the ground and the roads, are never cut.
export function applyCutaway(root: Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh) || object.userData.keepWhole) return
    const material = object.material as Cuttable
    // Only the building's own lit materials; the sky and anything custom are left alone.
    if (Array.isArray(material) || !(material instanceof MeshStandardMaterial || material instanceof MeshBasicMaterial)) return
    let above = patched.get(material)
    if (!above) {
      above = patch(material)
      patched.set(material, above)
      // Shadows are drawn with their own material; cut it the same way, so what is gone throws no shadow.
      const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking }) as Cuttable
      const depthAbove = patch(depth)
      object.customDepthMaterial = depth
      object.userData.cutDepthAbove = depthAbove
    }
    const height = cutHeightOf(object)
    above.value = height
    if (object.userData.cutDepthAbove) (object.userData.cutDepthAbove as IUniform<number>).value = height
  })
}

// Whether a point of a mesh is cut away, so a click there passes on to whatever shows behind it.
export function isCutAway(point: { x: number; y: number; z: number }, object: Object3D): boolean {
  if (point.y > cutHeightOf(object)) return true
  const length = cut.length.value
  if (length <= 0) return false
  const rel = new Vector3(point.x, point.y, point.z).sub(cut.origin.value)
  const t = rel.dot(cut.direction.value)
  if (t <= 0 || t >= length) return false
  const radius = cut.nearRadius.value + (cut.farRadius.value - cut.nearRadius.value) * (t / length)
  return rel.sub(cut.direction.value.clone().multiplyScalar(t)).length() < radius
}
