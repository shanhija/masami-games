import { DataTexture, ExtrudeGeometry, NearestFilter, Object3D, RedFormat, Shape } from 'three'

/**
 * The look: a golden evening in a toy town, flat and cartoon. Every solid wears a
 * MeshToonMaterial with this three-band gradient, its shadow band deeper than by day, so
 * a runner reads as a drawing with a lit side and a shaded side rather than a rendering.
 */
export const TOON_GRADIENT = (() => {
  const bands = new Uint8Array([95, 190, 255])
  const t = new DataTexture(bands, bands.length, 1, RedFormat)
  t.minFilter = NearestFilter
  t.magFilter = NearestFilter
  t.generateMipmaps = false
  t.needsUpdate = true
  return t
})()

export const palette = {
  /** The evening sky, top to horizon, and what hangs in it. */
  skyTop: '#3b2a78',
  skyMid: '#ff7a59',
  horizon: '#ffd58f',
  sun: '#ffb347',
  sunHalo: '#ffd28a',
  star: '#fff6d5',
  cloud: ['#ff9ecb', '#c9a7ff', '#ffc4a3'],
  /** The town behind the houses: dark towers far off, toy-coloured blocks nearer, windows coming on. */
  skylineFar: ['#4a3a7a', '#3d2f66'],
  skylineNear: ['#ff8c69', '#5cc8c0', '#ffcf5c', '#b48cff', '#ff6f91'],
  windowLit: '#ffe28a',
  windowDark: '#6b5a8a',
  ferris: '#ff6f91',
  ferrisHub: '#ffe28a',
  tower: '#8a7f9a',
  grass: '#3f9d72',
  grassDark: '#2e7a58',
  path: '#d8c9c2',
  kerb: '#f0e6de',
  road: '#3a3f52',
  roadLine: '#ffd23f',
  zebra: '#f4f6f8',
  lampPost: '#2a2f45',
  lampGlow: '#ffe08a',
  firefly: '#ffe89a',
  treeCrown: ['#1f6f5f', '#2a8a72', '#13594c'],
  treeTrunk: '#4a3a2a',
  wall: ['#ff8c69', '#5cc8c0', '#ffcf5c', '#b48cff'],
  roof: ['#2f3a66', '#4a2c5e', '#233d4d', '#5a2f3a'],
  door: '#3b2a4a',
  frame: '#fff6e8',
  chimney: '#5a4a5e',
  porch: '#c9b8b0',
  fence: '#fafafa',
  fenceShade: '#dcdcdc',
  policeBox: '#3b7dff',
  policeBoxEdge: '#1f4fb0',
  robberBox: '#6a3fb0',
  robberBoxEdge: '#3d2a66',
  lid: '#ffd23f',
  skin: '#ffd2a8',
  eye: '#ffffff',
  pupil: '#1c1c22',
  police: '#2f6fe8',
  policeDark: '#1c2331',
  badge: '#ffd23f',
  boot: '#1c1c22',
  robberShirt: '#f4f4f4',
  robberStripe: '#2b2b30',
  robberPants: '#3a3a44',
  beanie: '#3a3a44',
  mask: '#1c1c22',
  sack: '#d9b46a',
  coin: '#ffc933',
  dog: '#b8763c',
  dogDark: '#7a4a24',
  dogBelly: '#e8c39a',
  policeDog: '#3a3a3a',
  policeDogTan: '#c48a4a',
  vest: '#2f6fe8',
  collar: '#e8323c',
  car: ['#ff6b6b', '#ffd23f', '#57c46a', '#3b8bff'],
  tyre: '#2b2b30',
  glass: '#bfe9ff',
  headlight: '#fff1a8',
  banana: '#ffe14d',
  bananaDark: '#c9a227',
  spring: '#9aa3b2',
  skate: '#ff6b6b',
  wheel: '#ffffff',
  magnet: '#e8323c',
  magnetTip: '#d8dde6',
  bone: '#fff5e6',
  pack: '#ff8c42',
  propeller: '#d8dde6',
  whistle: '#d8dde6',
  dust: '#d7c9a8',
  smoke: '#e8ecf2',
  sparkle: ['#ffd23f', '#ffffff', '#ff9ecb', '#8fd8ff'],
  confetti: ['#ff6fa6', '#ffd23f', '#3b8bff', '#57c46a', '#ff8c42', '#ffffff'],
} as const

/** A five-point star in its own XY plane, radius `r`: the badge on the police, the picture on its crates, the stars a crash brings out. */
export function starShape(r: number) {
  const s = new Shape()
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 === 0 ? r : r * 0.45
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
  }
  s.closePath()
  return s
}
export const badgeGeometry = new ExtrudeGeometry(starShape(0.2), { depth: 0.05, bevelEnabled: false })

/** Hides or shows a whole subtree: a scale of nothing draws nothing and costs nothing to toggle. */
export function show(g: Object3D, on: boolean) {
  g.scale.setScalar(on ? 1 : 1e-4)
}
