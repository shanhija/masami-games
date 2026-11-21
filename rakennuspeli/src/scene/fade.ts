/**
 * Tall things that stand between the camera and what the child needs to see turn see-through: a
 * copy of each of their materials that blends, swapped in while the line of sight from the camera
 * to the active machine, the step's target or a party's landmark passes through them, and swapped
 * back after. Only the nearest surface of a faded thing shows: each of its meshes has a twin that writes
 * depth and no colour, drawn just before the see-through colour, which the depth test then keeps to
 * what lies nearest. Shadows stay: a see-through mesh still casts its own.
 */

import { useEffect, useMemo, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { InstancedMesh, Mesh, MeshBasicMaterial, type Group, type Material, type MeshStandardMaterial, type Object3D } from 'three'

import { damp } from '../game/math'
import { blocks, type Capsule, type Pt } from './frame'
import type { View } from './Camera'
import { spareLook } from './preload'

/** How see-through a faded thing is at the most, and how fast it fades, a second. */
const LEAST_OPAQUE = 0.25
const RATE = 5
/** The colour a faded thing glows with, and how much, so it reads as pale and not as a dark smudge. */
const GHOST = '#ffffff'
const GHOST_GLOW = 0.5

/** How much a copy glows when the fade is `v` of the way (0 solid, 1 faded): not at all at first, so a thing just starting to fade is not washed out. */
export const glowFor = (v: number): number => GHOST_GLOW * v

/** Transparent things draw in the order of their render order: the twins' depth first, then the see-through colour. */
const TWIN_ORDER = 1
const SEE_THROUGH_ORDER = 2

/** What a twin draws with: depth only, pushed back a hair so the colour pass at the true depth passes the test. */
const DEPTH_ONLY = new MeshBasicMaterial({ colorWrite: false, transparent: true, depthWrite: true, fog: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })

/** What a faded mesh needs: the material it shows while faded and the twin that holds its depth. */
export interface Fade {
  copies: Map<Material, MeshStandardMaterial>
  twins: Map<Mesh, Mesh>
  /** The call that takes each prepared mesh's upload mark back. */
  marks: Map<Mesh, () => void>
}

export const createFade = (): Fade => ({ copies: new Map(), twins: new Map(), marks: new Map() })

/** A copy of a lit material that blends, with the same shader. */
function fadedCopy(m: MeshStandardMaterial): MeshStandardMaterial {
  const copy = m.clone()
  copy.onBeforeCompile = m.onBeforeCompile
  copy.transparent = true
  copy.depthWrite = false
  // A light ghost: the lit colour is lifted toward white as the thing fades (`glowFor`), so a faded thing is pale on a dark road and on the grass.
  copy.emissive.set(GHOST)
  copy.emissiveIntensity = 0
  return copy
}

/** Whether the mesh is a twin, which is never faded. */
const isTwin = (mesh: Mesh): boolean => mesh.material === DEPTH_ONLY

/** The see-through material for a mesh's solid one, made once per material; null for a mesh that already blends and for a twin. */
function seeThrough(copies: Map<Material, MeshStandardMaterial>, mesh: Mesh): MeshStandardMaterial | null {
  const solid = mesh.material
  if (Array.isArray(solid)) throw new Error('useFade: a mesh with several materials')
  if (solid.transparent || solid === DEPTH_ONLY) return null
  let copy = copies.get(solid)
  if (copy === undefined) {
    copy = fadedCopy(solid as MeshStandardMaterial)
    copies.set(solid, copy)
  }
  return copy
}

/** The twin of a mesh: a child with the same shape, hidden and out of the shadows and of picking until the mesh fades. */
function makeTwin(mesh: Mesh): Mesh {
  let twin: Mesh
  if (mesh instanceof InstancedMesh) {
    // The instancing is part of the program, so the twin is instanced the way the mesh is.
    const instanced = new InstancedMesh(mesh.geometry, DEPTH_ONLY, mesh.instanceMatrix.count)
    instanced.instanceMatrix = mesh.instanceMatrix
    instanced.instanceColor = mesh.instanceColor
    instanced.count = mesh.count
    twin = instanced
  } else twin = new Mesh(mesh.geometry, DEPTH_ONLY)
  twin.visible = false
  twin.frustumCulled = mesh.frustumCulled
  twin.renderOrder = TWIN_ORDER
  twin.raycast = () => undefined
  mesh.add(twin)
  return twin
}

/** Whether `mesh` stands under `root`. */
function isUnder(mesh: Object3D, root: Object3D): boolean {
  for (let o: Object3D | null = mesh; o !== null; o = o.parent) if (o === root) return true
  return false
}

/**
 * Makes the see-through copy and the twin for every solid mesh under `root` that has none yet, and marks each copy for the upload, so
 * its program is built before play and not on the first frame a crane fades (the twins are in the scene, hidden, and the upload draws
 * them). A mesh that has left `root` since gives its twin and its mark back. Returns the call that takes all of them back.
 */
export function prepareFade(root: Object3D, fade: Fade): () => void {
  for (const mesh of [...fade.marks.keys()]) if (!isUnder(mesh, root)) forget(fade, mesh)
  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh || isTwin(mesh) || fade.marks.has(mesh)) return
    const copy = seeThrough(fade.copies, mesh)
    if (copy === null) return
    const twin = makeTwin(mesh)
    fade.twins.set(mesh, twin)
    fade.marks.set(mesh, spareLook(mesh, copy))
  })
  return () => {
    for (const mesh of [...fade.marks.keys()]) forget(fade, mesh)
  }
}

/** Takes a mesh's twin and upload mark back. */
function forget(fade: Fade, mesh: Mesh): void {
  fade.marks.get(mesh)!()
  fade.marks.delete(mesh)
  fade.twins.get(mesh)!.removeFromParent()
  fade.twins.delete(mesh)
}

/**
 * Fades the group while any of the view's focus points is behind one of the capsules as seen from
 * the camera. `shape` gives the capsules that stand for the group, or null while it must stay solid.
 * The glass and anything else that already blends keeps its look.
 */
export function useFade(group: RefObject<Group | null>, view: View, shape: () => readonly Capsule[] | null): void {
  const camera = useThree((s) => s.camera)
  const eye = useMemo<Pt>(() => [0, 0, 0], [])
  const state = useMemo(() => ({ v: 0, on: false, swapped: [] as Swapped[], fade: createFade() }), [])
  // After every render of the faded thing, so after a repaint or a new driver too: the new meshes get their copies, twins and upload marks
  // like the first ones, and join the fade when it is on.
  useEffect(() => {
    const root = group.current!
    prepareFade(root, state.fade)
    state.swapped = state.swapped.filter((s) => isUnder(s.mesh, root))
    if (state.on) swapIn(root, state)
  })
  useEffect(
    () => () => {
      for (const mesh of [...state.fade.marks.keys()]) forget(state.fade, mesh)
      for (const c of state.fade.copies.values()) c.dispose()
      state.fade.copies.clear()
      state.swapped.length = 0
      state.on = false
    },
    [state],
  )
  useFrame(() => {
    const caps = shape()
    eye[0] = camera.position.x
    eye[1] = camera.position.y
    eye[2] = camera.position.z
    const hides = caps !== null && view.focus.some((p) => caps.some((c) => blocks(eye, p, c)))
    state.v += ((hides ? 1 : 0) - state.v) * damp(RATE, view.dt)
    const on = state.v > 0.02
    for (const c of state.fade.copies.values()) {
      c.opacity = 1 - (1 - LEAST_OPAQUE) * state.v
      c.emissiveIntensity = glowFor(state.v)
    }
    if (on) matchTwins(state)
    if (on === state.on) return
    state.on = on
    if (on) swapIn(group.current!, state)
    else swapOut(state)
  })
}

/** A mesh showing its see-through copy, what it shows when solid, and its twin. */
interface Swapped {
  mesh: Mesh
  solid: Material
  twin: Mesh
}

/** The meshes of a faded thing that show their see-through copy. */
export interface Swaps {
  fade: Fade
  swapped: Swapped[]
}

/** An instanced mesh's twin draws as many instances as the mesh does this frame. */
export function matchTwins(state: Swaps): void {
  for (const s of state.swapped) if (s.twin instanceof InstancedMesh) s.twin.count = (s.mesh as InstancedMesh).count
}

/** Gives every swapped mesh its solid material back and turns its twin off. */
export function swapOut(state: Swaps): void {
  for (const s of state.swapped) {
    s.mesh.material = s.solid
    s.mesh.renderOrder = 0
    s.twin.visible = false
  }
  state.swapped.length = 0
}

/** Swaps every prepared mesh under `group` that is still solid for its see-through copy and turns its twin on; a mesh that has no copy yet stays solid. */
export function swapIn(group: Object3D, state: Swaps): void {
  group.traverse((o) => {
    const mesh = o as Mesh
    const twin = state.fade.twins.get(mesh)
    if (!mesh.isMesh || twin === undefined || state.swapped.some((s) => s.mesh === mesh)) return
    const solid = mesh.material as Material
    const copy = state.fade.copies.get(solid)
    if (copy === undefined) return
    state.swapped.push({ mesh, solid, twin })
    mesh.material = copy
    mesh.renderOrder = SEE_THROUGH_ORDER
    twin.visible = true
  })
}
