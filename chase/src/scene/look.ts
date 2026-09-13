import { DataTexture, NearestFilter, RedFormat } from 'three'

/**
 * The look: bright, flat, cartoon. Every solid wears a MeshToonMaterial with this
 * three-band gradient, so a car reads as a drawing with a lit side and a shaded side
 * rather than a rendering.
 */
export const TOON_GRADIENT = (() => {
  const bands = new Uint8Array([120, 200, 255])
  const t = new DataTexture(bands, bands.length, 1, RedFormat)
  t.minFilter = NearestFilter
  t.magFilter = NearestFilter
  t.generateMipmaps = false
  t.needsUpdate = true
  return t
})()

export const palette = {
  sky: '#8fd8ff',
  skyDeep: '#5ab4f5',
  sun: '#ffe066',
  moon: '#f4f1d8',
  cloud: '#ffffff',
  headlight: '#fff1a8',
  hillFar: '#8fd47a',
  hillMid: '#6cc45a',
  grass: '#58b845',
  grassDark: '#48a337',
  road: '#4d5566',
  roadEdge: '#c9d1dc',
  dash: '#fff3b0',
  treeCrown: ['#2e9e4f', '#3bb35b', '#57c46a'],
  treeTrunk: '#8a5a3c',
  flower: ['#ff6fa6', '#ffd23f', '#ff8c42', '#c084fc'],
  police: '#f5f7fa',
  policeBlue: '#2f6fe8',
  policeDark: '#1c2331',
  lightRed: '#ff3b3b',
  tailDim: '#8a1a1a',
  lightBlue: '#3b8bff',
  badge: '#ffd23f',
  robber: '#7b4cc9',
  robberDark: '#3d2a66',
  glass: '#bfe9ff',
  tyre: '#2b2b30',
  hub: '#d8dde6',
  skin: '#ffd2a8',
  mask: '#1c1c22',
  eye: '#ffffff',
  pupil: '#1c1c22',
  cap: '#2f6fe8',
  beanie: '#3a3a44',
  sack: '#d9b46a',
  coin: '#ffc933',
  rock: '#9aa3b2',
  rockDark: '#7d8696',
  log: '#9c6b43',
  logEnd: '#e0b98a',
  cake: '#ffb3c6',
  cream: '#fff5e6',
  cherry: '#e8323c',
  candle: '#8fd8ff',
  flame: '#ffb347',
  barrel: '#ff8c42',
  barrelBand: '#7a3f1c',
  smoke: '#e8ecf2',
  dust: '#d7c9a8',
  star: '#ffd23f',
  worm: '#ff9ecb',
  wormBelly: '#ffc4dd',
  confetti: ['#ff6fa6', '#ffd23f', '#3b8bff', '#57c46a', '#ff8c42', '#ffffff'],
} as const
