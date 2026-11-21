import { describe, expect, it } from 'vitest'
import { BoxGeometry, Group, InstancedMesh, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, Scene, type WebGLRenderer } from 'three'

import { createFade, glowFor, matchTwins, prepareFade, swapIn, swapOut, type Swaps } from './fade'
import { uploadAll } from './preload'

/** The meshes a draw of the scene meets, with the renderer's scissor ignored. */
function meshesDrawn(scene: Scene): Mesh[] {
  const seen: Mesh[] = []
  const gl = {
    getScissorTest: () => false,
    setScissorTest: () => undefined,
    getScissor: (v: { set: (...n: number[]) => void }) => v,
    setScissor: () => undefined,
    render: (sc: Scene) => sc.traverse((o) => o instanceof Mesh && seen.push(o)),
  } as unknown as WebGLRenderer
  uploadAll(gl, scene, new PerspectiveCamera())
  return seen
}

const materialsDrawn = (scene: Scene): Material[] => meshesDrawn(scene).map((m) => m.material as Material)

describe('prepareFade', () => {
  it('makes the see-through copy of every solid material once, has the upload draw it, and takes it back', () => {
    const solid = new MeshStandardMaterial()
    const glass = new MeshStandardMaterial({ transparent: true })
    const root = new Group()
    root.add(new Mesh(new BoxGeometry(), solid), new Mesh(new BoxGeometry(), solid), new Mesh(new BoxGeometry(), glass))
    const scene = new Scene()
    scene.add(root)
    const fade = createFade()

    const release = prepareFade(root, fade)

    expect([...fade.copies.keys()]).toEqual([solid])
    const copy = fade.copies.get(solid)!
    expect(copy.transparent).toBe(true)
    expect(copy.depthWrite).toBe(false)
    // The ghost is lifted toward white, and the solid material is left as it was.
    expect(copy.emissive.getHex()).toBe(0xffffff)
    expect(copy.emissiveIntensity).toBe(0)
    expect(glowFor(1)).toBeGreaterThan(0)
    expect(glowFor(0.1)).toBeLessThan(glowFor(1) / 5)
    expect(solid.emissive.getHex()).toBe(0)
    expect(materialsDrawn(scene).filter((m) => m === copy)).toHaveLength(2)

    release()
    expect(materialsDrawn(scene)).not.toContain(copy)
  })

  it('gives each solid mesh a hidden depth-only twin, drawn by the upload, and none to glass', () => {
    const solid = new MeshStandardMaterial()
    const glass = new MeshStandardMaterial({ transparent: true })
    const root = new Group()
    const body = new Mesh(new BoxGeometry(), solid)
    const window = new Mesh(new BoxGeometry(), glass)
    const beams = new InstancedMesh(new BoxGeometry(), solid, 4)
    beams.count = 3
    root.add(body, window, beams)
    const scene = new Scene()
    scene.add(root)
    const fade = createFade()

    const release = prepareFade(root, fade)

    expect([...fade.twins.keys()]).toEqual([body, beams])
    const twin = fade.twins.get(body)!
    expect(twin.parent).toBe(body)
    expect(twin.visible).toBe(false)
    expect(twin.castShadow).toBe(false)
    const depth = twin.material as MeshBasicMaterial
    expect(depth.colorWrite).toBe(false)
    expect(depth.depthWrite).toBe(true)
    // It draws before the see-through colour does, and never answers a pick.
    expect(twin.renderOrder).toBeLessThan(2)
    const hits: unknown[] = []
    twin.raycast({} as never, hits as never)
    expect(hits).toEqual([])
    // An instanced mesh's twin is instanced on the same matrices.
    const beamTwin = fade.twins.get(beams) as InstancedMesh
    expect(beamTwin).toBeInstanceOf(InstancedMesh)
    expect(beamTwin.instanceMatrix).toBe(beams.instanceMatrix)
    expect(beamTwin.count).toBe(3)
    // Both twins are drawn by the upload with the one depth material, and a twin is not itself faded.
    expect(materialsDrawn(scene).filter((m) => m === depth)).toHaveLength(2)
    expect(prepareFade(root, fade)).toBeTypeOf('function')
    expect(fade.twins.size).toBe(2)
    expect(fade.copies.size).toBe(1)

    release()
    expect(body.children).toEqual([])
    expect(fade.twins.size).toBe(0)
    expect(materialsDrawn(scene)).not.toContain(depth)
  })

  it('prepares a mesh that came later and lets go of one that left, so a repaint makes nothing to compile in play', () => {
    const solid = new MeshStandardMaterial()
    const root = new Group()
    const first = new Mesh(new BoxGeometry(), solid)
    root.add(first)
    const scene = new Scene()
    scene.add(root)
    const fade = createFade()
    prepareFade(root, fade)

    root.remove(first)
    const later = new Mesh(new BoxGeometry(), solid)
    const other = new Mesh(new BoxGeometry(), new MeshStandardMaterial())
    root.add(later, other)
    prepareFade(root, fade)

    expect([...fade.twins.keys()]).toEqual([later, other])
    expect(fade.copies.size).toBe(2)
    const copy = fade.copies.get(solid)!
    // The mesh that left no longer has the upload draw its copy: one mesh of that solid is left.
    expect(materialsDrawn(scene).filter((m) => m === copy)).toHaveLength(1)
  })

  it('refuses a mesh with several materials', () => {
    const root = new Group()
    root.add(new Mesh(new BoxGeometry(), [new MeshStandardMaterial(), new MeshStandardMaterial()]))
    expect(() => prepareFade(root, createFade())).toThrow()
  })
})

describe('swapping a faded thing', () => {
  it('shows each prepared solid mesh as its see-through copy after its twin, leaves glass and unprepared meshes alone, and gives it all back', () => {
    const solid = new MeshStandardMaterial()
    const glass = new MeshStandardMaterial({ transparent: true })
    const root = new Group()
    const body = new Mesh(new BoxGeometry(), solid)
    const window = new Mesh(new BoxGeometry(), glass)
    const beams = new InstancedMesh(new BoxGeometry(), solid, 4)
    beams.count = 2
    root.add(body, window, beams)
    const state: Swaps = { fade: createFade(), swapped: [] }
    prepareFade(root, state.fade)
    // A mesh that came after the preparation has no copy to show, and none is made in play.
    const late = new Mesh(new BoxGeometry(), new MeshStandardMaterial())
    root.add(late)
    const lateSolid = late.material

    swapIn(root, state)

    const copy = state.fade.copies.get(solid)!
    expect(body.material).toBe(copy)
    expect(beams.material).toBe(copy)
    expect(window.material).toBe(glass)
    expect(late.material).toBe(lateSolid)
    expect(state.fade.copies.size).toBe(1)
    const twin = state.fade.twins.get(body)!
    expect(twin.visible).toBe(true)
    expect(body.renderOrder).toBeGreaterThan(twin.renderOrder)
    // Swapping again changes nothing.
    swapIn(root, state)
    expect(state.swapped).toHaveLength(2)
    // The instanced twin follows the mesh's count.
    beams.count = 4
    matchTwins(state)
    expect((state.fade.twins.get(beams) as InstancedMesh).count).toBe(4)

    swapOut(state)

    expect(body.material).toBe(solid)
    expect(beams.material).toBe(solid)
    expect(body.renderOrder).toBe(0)
    expect(twin.visible).toBe(false)
    expect(state.swapped).toEqual([])
  })
})
