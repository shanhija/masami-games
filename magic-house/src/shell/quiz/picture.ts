/**
 * A model as a still picture for the quiz: drawn once in Silly Billy's look (its meshes by import,
 * scene/recipeMesh.ts) by one small renderer the quiz shares, seen from the front a little from the
 * right and above, and kept as an image by its key. So a screen of twelve objects costs one WebGL
 * context and no frame after the first, where a canvas each would cost twelve contexts every frame.
 */

import { DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three'

import type { Recipe } from '../../../../silly-billy/src/engine/types'
import { palette } from '../../../../silly-billy/src/scene/look'
import { buildModel, disposeModel, ModelView } from '../../../../silly-billy/src/scene/recipeMesh'

/** The picture's side, pixels; it is shown smaller, so it stays sharp on a tablet. */
const SIDE = 256
/** The camera's lens, degrees, and where it looks from (toward the model's middle). */
const FOV = 26
const FROM = new Vector3(0.55, 0.5, 1).normalize()
/** The picture's light, its own (a quiz object stands in no room): a sun from high on the left, metres from the model's middle, and a fill from the sky above and a warm grey below. */
const PICTURE_LIGHT = { sun: 2.1, sunFrom: [-4, 12, 6] as const, fill: 1, fillBelow: '#a89f94' } as const

let renderer: WebGLRenderer | null = null
const scene = new Scene()
const camera = new PerspectiveCamera(FOV, 1, 0.01, 100)
const sun = new DirectionalLight('#ffffff', PICTURE_LIGHT.sun)
scene.add(sun, sun.target, new HemisphereLight(palette.skyLight, PICTURE_LIGHT.fillBelow, PICTURE_LIGHT.fill))
const pictures = new Map<string, string>()

/** The picture of a model as an image URL, drawn the first time its key is asked for. */
export function pictureOf(key: string, recipe: Recipe): string {
  const known = pictures.get(key)
  if (known !== undefined) return known
  if (renderer === null) {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setSize(SIDE, SIDE, false)
    renderer.outputColorSpace = SRGBColorSpace
    renderer.setClearColor(0x000000, 0)
  }
  const model = buildModel(recipe, false, null, null)
  const view = new ModelView(model)
  const { min, max } = recipe.bounds
  const middle = new Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2)
  // Fitted by the model's widest half-side, a little over, rather than its corner-to-corner ball, so a long low thing still fills the picture.
  const radius = Math.max(0.05, 0.62 * Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]))
  const distance = radius / Math.sin(((FOV / 2) * Math.PI) / 180)
  camera.position.copy(middle).addScaledVector(FROM, distance)
  camera.near = distance / 20
  camera.far = distance * 4
  camera.lookAt(middle)
  camera.updateProjectionMatrix()
  sun.position.set(middle.x + PICTURE_LIGHT.sunFrom[0], middle.y + PICTURE_LIGHT.sunFrom[1], middle.z + PICTURE_LIGHT.sunFrom[2])
  sun.target.position.copy(middle)
  scene.add(view.root)
  renderer.render(scene, camera)
  const url = renderer.domElement.toDataURL('image/png')
  scene.remove(view.root)
  disposeModel(model)
  pictures.set(key, url)
  return url
}
