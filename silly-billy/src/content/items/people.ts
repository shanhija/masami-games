/**
 * What people wear: four hair styles, a cap and glasses, built around the model kid the way
 * ITEM_DOC says (the origin is the middle of the head, a ball of radius 0.23, the face toward
 * +z). Hair is brown and the cast tints it; the face stays clear so its eyes and mouth show.
 * The camera looks down from high up, so the cap is worn backwards: a brim in front would
 * hide the eyes.
 */

import type { BuiltinItem } from '../../engine/library'
import type { Vec3 } from '../../engine/types'
import { item, spread } from './shapes'

const HAIR = 'brown'
const TIE = 'hotpink'

export const PEOPLE_ITEMS: BuiltinItem[] = [
  item({
    id: 'hair-ponytail',
    name: 'ponytail',
    nameFi: 'poninhäntä',
    calls: ['poninhäntä', 'poninhännän', 'poninhäntää', 'poninhännät', 'ponnari', 'ponnarin', 'ponnaria', 'ponnarit', 'hevosenhäntä', 'pitkä tukka', 'pitkät hiukset', 'ponytail', 'long hair'],
    about: 'Long hair tied in a high ponytail that hangs down the back, with a pink hair tie.',
    build: (m) => {
      m.sphere(0.255, { at: [0, 0.035, -0.04], color: HAIR })
      m.sphere(0.12, { at: [0, 0.17, 0.12], scale: [1.6, 0.6, 0.9], color: HAIR })
      m.sphere(0.085, { at: [0, 0.13, -0.29], color: HAIR })
      m.torus(0.06, 0.022, { at: [0, 0.11, -0.33], rot: [-0.64, 0, 0], color: TIE })
      m.tube([[0, 0.12, -0.32], [0, 0.04, -0.41], [0, -0.12, -0.42], [0, -0.3, -0.37], [0, -0.42, -0.32]], 0.065, { color: HAIR })
      m.sphere(0.06, { at: [0, -0.43, -0.31], color: HAIR })
      return { carry: 'hand', wear: 'hair', bouncy: 0.2, solid: false }
    },
  }),
  item({
    id: 'hair-short',
    name: 'short hair',
    nameFi: 'lyhyt tukka',
    calls: ['lyhyt tukka', 'lyhyet hiukset', 'lyhyttukka', 'siilitukka', 'siili', 'poikatukka', 'tukka', 'tukan', 'tukkaa', 'tukat', 'hiukset', 'hiuksia', 'hiusten', 'short hair', 'hair'],
    about: 'Short hair close to the head with a little quiff in front.',
    build: (m) => {
      m.sphere(0.245, { at: [0, 0.04, -0.03], color: HAIR })
      // The quiff stays inside the cap's crown: a cap on top must hide it.
      m.sphere(0.1, { at: [0.03, 0.19, 0.1], scale: [1.35, 0.65, 1.05], color: HAIR })
      m.sphere(0.1, { at: [-0.06, 0.185, 0.095], scale: [1.25, 0.6, 1], color: HAIR })
      return { carry: 'hand', wear: 'hair', bouncy: 0.2, solid: false }
    },
  }),
  item({
    id: 'hair-curly',
    name: 'curly hair',
    nameFi: 'kihara tukka',
    calls: ['kihara', 'kiharat', 'kiharaa', 'kiharan', 'kiharia', 'kihara tukka', 'kiharat hiukset', 'kiharatukka', 'kiharapää', 'kutrit', 'kiehkurat', 'afro', 'pörrö', 'pörröinen', 'pörrötukka', 'curly hair', 'curls'],
    about: 'Big curly hair: a cloud of round curls all over the head and down to the shoulders.',
    build: (m) => {
      const centre: Vec3 = [0, 0.03, -0.03]
      for (const d of spread(44)) {
        const face = d[2] > 0.2 && d[1] < 0.6
        const chin = d[1] < -0.45 && d[2] > -0.3
        if (!face && !chin) m.sphere(0.105, { at: [centre[0] + d[0] * 0.27, centre[1] + d[1] * 0.27, centre[2] + d[2] * 0.27], color: HAIR })
      }
      for (const [x, y, z] of [[0.21, -0.24, -0.12], [-0.21, -0.24, -0.12], [0, -0.3, -0.22], [0.13, -0.38, -0.2], [-0.13, -0.38, -0.2]] as const) m.sphere(0.1, { at: [x, y, z], color: HAIR })
      return { carry: 'hand', wear: 'hair', bouncy: 0.3, solid: false }
    },
  }),
  item({
    id: 'hair-pigtails',
    name: 'pigtails',
    nameFi: 'saparot',
    calls: ['saparot', 'saparo', 'saparoa', 'saparoita', 'saparoiden', 'saparoille', 'letit', 'letti', 'lettiä', 'lettejä', 'palmikot', 'palmikko', 'palmikoita', 'pigtails', 'bunches', 'braids'],
    about: 'Hair in two bunches sticking out at the sides of the head, each with a pink hair tie.',
    build: (m) => {
      m.sphere(0.25, { at: [0, 0.035, -0.035], color: HAIR })
      m.sphere(0.12, { at: [0, 0.17, 0.12], scale: [1.6, 0.6, 0.9], color: HAIR })
      for (const s of [-1, 1]) {
        m.sphere(0.075, { at: [s * 0.27, 0.06, -0.06], color: HAIR })
        m.torus(0.05, 0.02, { at: [s * 0.31, 0.05, -0.06], rot: [0, Math.PI / 2, 0], color: TIE })
        m.tube([[s * 0.3, 0.05, -0.06], [s * 0.38, 0.01, -0.07], [s * 0.43, -0.1, -0.06], [s * 0.44, -0.24, -0.04]], 0.06, { color: HAIR })
        m.sphere(0.055, { at: [s * 0.44, -0.25, -0.04], color: HAIR })
      }
      return { carry: 'hand', wear: 'hair', bouncy: 0.2, solid: false }
    },
  }),
  item({
    id: 'cap',
    name: 'cap',
    nameFi: 'lippis',
    calls: ['lippis', 'lippiksen', 'lippistä', 'lippikset', 'lippalakki', 'lippalakin', 'lippalakkia', 'lakki', 'lakin', 'lakkia', 'hattu', 'hatun', 'hattua', 'hatut', 'cap', 'hat', 'baseball cap'],
    about: 'A red baseball cap with a white badge, worn backwards with the brim at the back.',
    build: (m) => {
      // The crown is bigger than any hair but the big curls, so it sits over the hair, and its front over a fringe or a quiff (still above the eyes).
      m.sphere(0.27, { at: [0, 0.13, -0.04], scale: [1, 0.75, 1.075], color: 'red' })
      m.sphere(0.1, { at: [0, 0.17, 0.1], scale: [2.15, 0.95, 1.45], color: 'red' })
      m.cylinder(0.15, 0.15, 0.025, { at: [0, 0.09, -0.33], rot: [0.15, 0, 0], scale: [1, 1, 0.85], color: 'red' })
      m.sphere(0.03, { at: [0, 0.335, -0.04], color: 'red' })
      m.sphere(0.06, { at: [0, 0.2, 0.24], rot: [-0.6, 0, 0], scale: [1, 1, 0.35], color: 'white' })
      return { carry: 'hand', wear: 'head', bouncy: 0.3, solid: false }
    },
  }),
  item({
    id: 'glasses',
    name: 'glasses',
    nameFi: 'lasit',
    calls: ['lasit', 'lasien', 'laseja', 'laseille', 'silmälasit', 'silmälasien', 'silmälaseja', 'silmälaseille', 'rillit', 'rillien', 'rillejä', 'glasses', 'specs', 'spectacles'],
    about: 'Round black glasses.',
    build: (m) => {
      for (const s of [-1, 1]) {
        m.torus(0.075, 0.02, { at: [s * 0.09, 0.03, 0.24], color: 'black' })
        m.tube([[s * 0.165, 0.035, 0.235], [s * 0.22, 0.04, 0.13], [s * 0.24, 0.04, 0]], 0.013, { color: 'black' })
      }
      m.box(0.04, 0.016, 0.016, { at: [0, 0.045, 0.248], color: 'black' })
      return { carry: 'hand', wear: 'face', bouncy: 0.2, solid: false }
    },
  }),
]
