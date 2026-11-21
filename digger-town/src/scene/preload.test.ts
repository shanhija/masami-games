import { describe, expect, it } from 'vitest'
import { BoxGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Vector4, type WebGLRenderer } from 'three'

import { giveColours, spare, spareLook, uploadAll } from './preload'

/** A renderer that only records what the scene looks like when it is asked to draw. */
function fakeRenderer(seen: { visible: boolean[]; culled: boolean[]; meshes: number; scissor: number[] | null }): WebGLRenderer {
  let test = false
  const box = new Vector4(0, 0, 640, 480)
  return {
    getScissorTest: () => test,
    setScissorTest: (on: boolean) => void (test = on),
    getScissor: (v: Vector4) => v.copy(box),
    setScissor: (x: number, y: number, w: number, h: number) => void box.set(x, y, w, h),
    render: (scene: Scene) => {
      seen.scissor = test ? box.toArray() : null
      scene.traverse((o) => {
        seen.visible.push(o.visible)
        if (o instanceof Mesh) {
          seen.culled.push(o.frustumCulled)
          seen.meshes++
        }
      })
    },
  } as unknown as WebGLRenderer
}

describe('uploadAll', () => {
  it('draws everything shown into a zero-size scissor, with the spare shapes, then puts it all back', () => {
    const scene = new Scene()
    const hiddenGroup = new Group()
    hiddenGroup.visible = false
    const inside = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    inside.visible = false
    hiddenGroup.add(inside)
    const plain = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    scene.add(hiddenGroup, plain)
    spare(new BoxGeometry())
    const seen = { visible: [] as boolean[], culled: [] as boolean[], meshes: 0, scissor: null as number[] | null }
    const gl = fakeRenderer(seen)

    uploadAll(gl, scene, new PerspectiveCamera())

    expect(seen.visible.every((v) => v)).toBe(true)
    expect(seen.culled.every((c) => !c)).toBe(true)
    expect(seen.meshes).toBe(3)
    expect(seen.scissor).toEqual([0, 0, 0, 0])
    expect(hiddenGroup.visible).toBe(false)
    expect(inside.visible).toBe(false)
    expect(plain.visible).toBe(true)
    expect(plain.frustumCulled).toBe(true)
    expect(scene.children).toHaveLength(2)
    expect(gl.getScissorTest()).toBe(false)
    expect(gl.getScissor(new Vector4()).toArray()).toEqual([0, 0, 640, 480])
  })
})

describe('spareLook', () => {
  it('draws a hidden copy of the mesh with the spare material, with its shadow flags, until the mark is taken back, and leaves the scene as it was', () => {
    const scene = new Scene()
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    mesh.receiveShadow = true
    scene.add(mesh)
    const other = new MeshBasicMaterial()
    const release = spareLook(mesh, other)
    const drawn: Mesh[] = []
    const gl = { ...fakeRenderer({ visible: [], culled: [], meshes: 0, scissor: null }), render: (sc: Scene) => sc.traverse((o) => o instanceof Mesh && drawn.push(o)) } as unknown as WebGLRenderer

    uploadAll(gl, scene, new PerspectiveCamera())
    const copy = drawn.find((m) => m.material === other)!
    expect(copy.geometry).toBe(mesh.geometry)
    expect(copy.receiveShadow).toBe(true)
    expect(copy.castShadow).toBe(false)
    expect(scene.children).toEqual([mesh])

    release()
    drawn.length = 0
    uploadAll(gl, scene, new PerspectiveCamera())
    expect(drawn.some((m) => m.material === other)).toBe(false)
  })

  it('draws an instanced mesh as an instanced copy with the same instances', () => {
    const scene = new Scene()
    const mesh = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 4)
    giveColours(mesh)
    scene.add(mesh)
    const other = new MeshBasicMaterial()
    const release = spareLook(mesh, other)
    const drawn: Mesh[] = []
    const gl = { ...fakeRenderer({ visible: [], culled: [], meshes: 0, scissor: null }), render: (sc: Scene) => sc.traverse((o) => o instanceof Mesh && drawn.push(o)) } as unknown as WebGLRenderer

    uploadAll(gl, scene, new PerspectiveCamera())
    const copy = drawn.find((m) => m.material === other) as InstancedMesh
    expect(copy).toBeInstanceOf(InstancedMesh)
    expect(copy.count).toBe(4)
    expect(copy.instanceMatrix).toBe(mesh.instanceMatrix)
    expect(copy.instanceColor).toBe(mesh.instanceColor)
    release()
  })
})

describe('giveColours', () => {
  it('gives an instanced mesh one colour per instance once, and ignores null', () => {
    const mesh = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 5)
    expect(mesh.instanceColor).toBeNull()
    giveColours(null)
    giveColours(mesh)
    const first = mesh.instanceColor!
    expect(first.count).toBe(5)
    expect(first.itemSize).toBe(3)
    giveColours(mesh)
    expect(mesh.instanceColor).toBe(first)
  })
})
