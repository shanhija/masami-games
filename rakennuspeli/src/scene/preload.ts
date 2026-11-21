/**
 * Sends everything the scene could ever draw to the graphics card before play, so no shape or
 * material is first seen in the middle of a game.
 */

import { InstancedBufferAttribute, InstancedMesh, Mesh, MeshBasicMaterial, Vector4, type BufferGeometry, type Material, type Camera, type Object3D, type Scene, type WebGLRenderer } from 'three'

const spares = new Set<BufferGeometry>()

/** Marks a geometry that a mesh swaps in during play, so `uploadAll` sends it too. Returns it. */
export function spare(geometry: BufferGeometry): BufferGeometry {
  spares.add(geometry)
  return geometry
}

const looks = new Set<{ mesh: Mesh; material: Material }>()

/**
 * Marks a material that `mesh` takes on during play, so `uploadAll` gives it its program too: the upload draws a hidden
 * copy of the mesh (its current geometry, its shadow flags) with that material. Returns the call that takes the mark back.
 */
export function spareLook(mesh: Mesh, material: Material): () => void {
  const look = { mesh, material }
  looks.add(look)
  return () => void looks.delete(look)
}

/**
 * Gives an instanced mesh its instance colour when it is made (r3f ref callback, so null is
 * ignored). Without it the upload draws the mesh with the plain program, and the instance-colour
 * variant compiles on the first frame that sets a colour.
 */
export function giveColours(mesh: InstancedMesh | null): void {
  if (mesh !== null && mesh.instanceColor === null) mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count * 3), 3)
}

const SPARE_MATERIAL = new MeshBasicMaterial()

/** An instanced mesh of the same instances in another material: the instancing is part of the program. */
function instancedLike(mesh: InstancedMesh, material: Material): InstancedMesh {
  const copy = new InstancedMesh(mesh.geometry, material, mesh.count)
  copy.instanceMatrix = mesh.instanceMatrix
  copy.instanceColor = mesh.instanceColor
  return copy
}

/**
 * Draws the scene once with everything shown and nothing visible on screen (a zero-size scissor):
 * every geometry is uploaded and every material gets its program, hidden meshes and meshes
 * outside the view and the `spare` geometries included. Each object's `visible` and `frustumCulled` are put back after. Run it
 * once the scene is mounted, after `gl.compileAsync` has finished, and never inside the frame loop.
 */
export function uploadAll(gl: WebGLRenderer, scene: Scene, camera: Camera): void {
  const hidden: Object3D[] = []
  const culled: Mesh[] = []
  scene.traverse((o) => {
    if (!o.visible) {
      hidden.push(o)
      o.visible = true
    }
    if ((o as Mesh).isMesh && o.frustumCulled) {
      culled.push(o as Mesh)
      o.frustumCulled = false
    }
  })
  const extra: Mesh[] = [...spares].map((g) => new Mesh(g, SPARE_MATERIAL))
  for (const { mesh, material } of looks) {
    const copy = mesh instanceof InstancedMesh ? instancedLike(mesh, material) : new Mesh(mesh.geometry, material)
    copy.castShadow = mesh.castShadow
    copy.receiveShadow = mesh.receiveShadow
    extra.push(copy)
  }
  extra.forEach((m) => {
    m.frustumCulled = false
    scene.add(m)
  })
  const scissor = gl.getScissorTest()
  gl.setScissorTest(true)
  const box = gl.getScissor(new Vector4())
  gl.setScissor(0, 0, 0, 0)
  try {
    gl.render(scene, camera)
  } finally {
    gl.setScissor(box.x, box.y, box.z, box.w)
    gl.setScissorTest(scissor)
    scene.remove(...extra)
    for (const o of hidden) o.visible = false
    for (const o of culled) o.frustumCulled = true
  }
}
