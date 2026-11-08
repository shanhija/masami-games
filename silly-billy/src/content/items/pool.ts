/**
 * The swimming pool's things: the diving board and ladders at the pool's edge, the loungers,
 * parasols and palms on the tiles, the lifeguard's tall chair, and the toys that float.
 * The pool's water is the ground's (engine/rooms.ts); a ladder reaches down into it.
 */

import type { BuiltinItem } from '../../engine/library'
import { item, palette, yawPitch } from './shapes'

const CHROME = 'silver'

export const POOL_ITEMS: BuiltinItem[] = [
  item({
    id: 'diving-board',
    name: 'diving board',
    nameFi: 'hyppylauta',
    calls: ['hyppylauta', 'hyppylaudan', 'hyppylaudalle', 'hyppylaudalla', 'hyppylaudalta', 'hyppylautaa', 'hyppytorni', 'hyppytornin', 'hyppytorniin', 'hyppytornista', 'ponnahduslauta', 'ponnahduslaudalle', 'diving board'],
    about: "A diving board at the pool's edge: steps up the back (anchor 'ladder'), a blue stand (anchor 'top'), and a white board with a red tip (part 'board', bounce it with rx) reaching out over the water to its 'end'.",
    build: (m) => {
      const h = 1.0
      m.box(0.75, h, 0.7, { at: [0, h / 2, -0.75], color: 'blue' })
      for (let i = 0; i < 3; i++) m.box(0.6, 0.25 * (i + 1), 0.22, { at: [0, 0.125 * (i + 1), -1.21 - 0.22 * (2 - i)], color: 'white' })
      for (const s of [-1, 1]) m.tube([[s * 0.34, 0.25, -1.75], [s * 0.34, 0.9, -1.75], [s * 0.34, 1.55, -1.1], [s * 0.34, 1.55, -0.5]], 0.025, { color: CHROME })
      m.box(0.3, 0.12, 0.3, { at: [0, h + 0.01, -0.2], color: 'blue' })
      m.part('board', { at: [0, h + 0.1, -0.8] }, () => {
        m.box(0.5, 0.06, 2.6, { at: [0, 0, 1.3], color: 'white' })
        m.box(0.52, 0.065, 0.3, { at: [0, 0, 2.45], color: 'red' })
        m.anchor('end', [0, 0.04, 2.4])
        m.anchor('seat', [0, 0.04, 2.4])
      })
      m.anchor('ladder', [0, 0, -2.0])
      m.anchor('top', [0, h + 0.14, -0.75])
      return { carry: 'no', sit: true, solid: true }
    },
  }),
  item({
    id: 'lounger',
    name: 'lounger',
    nameFi: 'aurinkotuoli',
    calls: ['aurinkotuoli', 'aurinkotuolin', 'aurinkotuoliin', 'aurinkotuolille', 'aurinkotuolilla', 'aurinkotuolia', 'lepotuoli', 'lepotuolin', 'lepotuoliin', 'lepotuolille', 'lepotuolilla', 'rantatuoli', 'rantatuolille', 'tuoli', 'tuolin', 'tuoliin', 'tuolille', 'tuolilla', 'tuolia', 'lounger', 'sun lounger', 'deck chair'],
    about: "A sun lounger: a low white frame with a blue and white striped cushion and a raised back at the rear; sit or lie on its 'seat'.",
    build: (m) => {
      const h = 0.32
      for (const x of [-0.26, 0.26]) for (const z of [-0.75, 0.85]) m.cylinder(0.03, 0.03, h, { at: [x, h / 2, z], color: 'white' })
      m.box(0.62, 0.06, 1.3, { at: [0, h, 0.3], color: 'white' })
      for (let i = 0; i < 5; i++) m.box(0.58, 0.05, 0.25, { at: [0, h + 0.05, -0.2 + i * 0.25], color: i % 2 === 0 ? 'skyblue' : 'white' })
      m.box(0.62, 0.06, 0.72, { at: [0, h + 0.23, -0.6], rot: [0.6, 0, 0], color: 'white' })
      m.box(0.58, 0.05, 0.66, { at: [0, h + 0.27, -0.58], rot: [0.6, 0, 0], color: 'skyblue' })
      m.anchor('seat', [0, h + 0.08, 0.15])
      return { carry: 'no', sit: true, solid: true }
    },
  }),
  item({
    id: 'parasol',
    name: 'parasol',
    nameFi: 'aurinkovarjo',
    calls: ['aurinkovarjo', 'aurinkovarjon', 'aurinkovarjoa', 'aurinkovarjolle', 'aurinkovarjot', 'päivänvarjo', 'päivänvarjon', 'sateenvarjo', 'sateenvarjon', 'sateenvarjoa', 'varjo', 'varjon', 'varjoon', 'parasol', 'umbrella', 'sunshade'],
    about: 'A big red and white beach umbrella on a white pole; people walk under it.',
    build: (m) => {
      m.cylinder(0.25, 0.28, 0.08, { at: [0, 0.04, 0], color: 'white' })
      m.cylinder(0.03, 0.03, 2.3, { at: [0, 1.15, 0], color: 'white' })
      // Three rings of the same slope, red, white and red again toward the top.
      const slope = 0.45 / 1.2
      const apex = 2.425
      for (const [r, color, lift] of [[1.2, 'red', 0], [0.75, 'white', 0.02], [0.35, 'red', 0.04]] as const) m.cone(r, r * slope, { at: [0, apex + lift - (r * slope) / 2, 0], color })
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        m.sphere(0.09, { at: [Math.sin(a) * 1.15, 2.0, Math.cos(a) * 1.15], scale: [1, 0.6, 1], color: i % 2 === 0 ? 'red' : 'white' })
      }
      m.sphere(0.05, { at: [0, apex + 0.06, 0], color: 'white' })
      return { carry: 'no', solid: false }
    },
  }),
  item({
    id: 'swim-ring',
    name: 'swim ring',
    nameFi: 'uimarengas',
    calls: ['uimarengas', 'uimarenkaan', 'uimarengasta', 'uimarenkaaseen', 'uimarenkaalla', 'uimarenkaalle', 'uimarenkaat', 'rengas', 'renkaan', 'rengasta', 'renkaaseen', 'pelastusrengas', 'pelastusrenkaan', 'swim ring', 'rubber ring'],
    about: 'A red and white swim ring that floats and bounces.',
    build: (m) => {
      const r = 0.32
      const tube = 0.1
      for (let i = 0; i < 8; i++) {
        const points = [0, 1, 2, 3].map((k) => {
          const a = ((i + k / 3) / 8) * Math.PI * 2
          return [Math.cos(a) * r, tube, Math.sin(a) * r]
        })
        m.tube(points, tube, { color: i % 2 === 0 ? 'red' : 'white' })
      }
      return { carry: 'hug', bouncy: 0.6, solid: false }
    },
  }),
  item({
    id: 'beach-ball',
    name: 'beach ball',
    nameFi: 'rantapallo',
    calls: ['rantapallo', 'rantapallon', 'rantapalloa', 'rantapallolla', 'rantapallolle', 'rantapalloon', 'uimapallo', 'vesipallo', 'vesipalloa', 'beach ball'],
    about: 'A big light beach ball with red, yellow and blue stripes and white tops; it floats and bounces high.',
    build: (m) => {
      const r = 0.21
      m.sphere(r, { at: [0, r, 0], color: 'white' })
      // Each stretched ball shows through the white one in two stripes, on opposite sides.
      ;(['red', 'yellow', 'blue'] as const).forEach((color, i) => m.sphere(r * 1.02, { at: [0, r, 0], rot: [0, (i * Math.PI) / 3, 0], scale: [0.9, 0.95, 1], color }))
      return { carry: 'hand', bouncy: 0.8, solid: false }
    },
  }),
  item({
    id: 'rubber-duck',
    name: 'rubber duck',
    nameFi: 'kumiankka',
    calls: ['kumiankka', 'kumiankan', 'kumiankkaa', 'kumiankalle', 'kumiankalla', 'kumiankat', 'kumiankkoja', 'ankka', 'ankan', 'ankkaa', 'ankalle', 'ankalla', 'ankat', 'ankkoja', 'ankkojen', 'rubber duck', 'duck', 'ducky'],
    about: 'A big yellow rubber duck with an orange beak; it floats.',
    build: (m) => {
      m.sphere(0.13, { at: [0, 0.11, -0.02], scale: [1, 0.75, 1.25], color: 'yellow' })
      m.sphere(0.085, { at: [0, 0.25, 0.08], color: 'yellow' })
      m.cone(0.04, 0.09, { at: [0, 0.235, 0.19], rot: [Math.PI / 2, 0, 0], color: 'orange' })
      for (const x of [-0.045, 0.045]) m.sphere(0.016, { at: [x, 0.275, 0.155], color: 'black' })
      m.cone(0.05, 0.1, { at: [0, 0.18, -0.17], rot: [-1.05, 0, 0], color: 'yellow' })
      return { carry: 'hand', bouncy: 0.4, solid: false }
    },
  }),
  item({
    id: 'towel',
    name: 'towel',
    nameFi: 'pyyhe',
    calls: ['pyyhe', 'pyyhkeen', 'pyyhettä', 'pyyhkeelle', 'pyyhkeellä', 'pyyhkeeseen', 'pyyhkeet', 'pyyhkeitä', 'rantapyyhe', 'rantapyyhkeelle', 'pyyheliina', 'towel', 'beach towel'],
    about: "A pink, white and turquoise striped beach towel lying flat, with a rolled pillow end; lie or sit on its 'seat'.",
    build: (m) => {
      const l = 1.5
      const stripes = ['hotpink', 'white', 'turquoise', 'white', 'hotpink']
      stripes.forEach((color, i) => m.box(0.75, 0.025, l / stripes.length, { at: [0, 0.0125, -l / 2 + l / 10 + (i * l) / stripes.length], color }))
      m.cylinder(0.07, 0.07, 0.75, { at: [0, 0.07, -l / 2 + 0.07], rot: [0, 0, Math.PI / 2], color: 'hotpink' })
      m.anchor('seat', [0, 0.03, 0.1])
      return { carry: 'hug', sit: true, solid: false }
    },
  }),
  item({
    id: 'palm',
    name: 'palm',
    nameFi: 'palmu',
    calls: ['palmu', 'palmun', 'palmua', 'palmuun', 'palmulle', 'palmulla', 'palmut', 'palmuja', 'palmupuu', 'palmupuun', 'palm', 'palm tree'],
    about: 'A palm tree in a big orange pot: a ringed trunk leaning a little, long green fronds and coconuts.',
    build: (m) => {
      m.lathe([[0, 0], [0.32, 0], [0.42, 0.55], [0.47, 0.6], [0.4, 0.6], [0.36, 0.5], [0, 0.5]], { color: '#d2723c' })
      for (let i = 0; i < 6; i++) m.cylinder(0.11 - i * 0.008, 0.13 - i * 0.008, 0.46, { at: [i * 0.04, 0.82 + i * 0.42, 0], rot: [0, 0, -0.06], color: i % 2 === 0 ? palette.trunk : palette.stump })
      const top = [0.24, 3.1, 0] as const
      for (let i = 0; i < 7; i++) {
        const yaw = (i / 7) * Math.PI * 2 + 0.3
        const droop = 0.45 + (i % 2) * 0.15
        const out = 0.68
        m.sphere(0.75, {
          at: [top[0] + Math.sin(yaw) * Math.cos(droop) * out, top[1] - Math.sin(droop) * out + 0.1, top[2] + Math.cos(yaw) * Math.cos(droop) * out],
          rot: yawPitch(yaw, droop),
          scale: [0.28, 0.06, 1],
          color: palette.leaves[i % 3],
        })
      }
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2
        m.sphere(0.1, { at: [top[0] + Math.sin(a) * 0.13, top[1] - 0.12, top[2] + Math.cos(a) * 0.13], color: '#6b4a2b' })
      }
      return { carry: 'no', solid: true }
    },
  }),
  item({
    id: 'lifeguard-chair',
    name: 'lifeguard chair',
    nameFi: 'vahtituoli',
    calls: ['hengenpelastajantuoli', 'hengenpelastajan tuoli', 'hengenpelastaja', 'valvojantuoli', 'vahtituoli', 'vahtituoliin', 'vahtituolille', 'tähystystuoli', 'tähystystuoliin', 'korkea tuoli', 'uimavalvoja', 'lifeguard chair', 'lifeguard'],
    about: "The lifeguard's tall white chair with a red seat and back, rungs to climb up the front, and a little red flag; sit on its 'seat' high up.",
    build: (m) => {
      const h = 1.6
      // Four legs, splayed: each one's top leans in toward the seat.
      for (const x of [-0.38, 0.38]) for (const z of [-0.32, 0.32]) m.cylinder(0.04, 0.05, h, { at: [x * 1.08, h / 2, z * 1.08], rot: [-z * 0.25, 0, x * 0.2], color: 'white' })
      for (const y of [0.45, 0.85, 1.25]) m.box(0.82, 0.05, 0.05, { at: [0, y, 0.34], color: 'white' })
      m.box(0.05, 0.05, 0.7, { at: [-0.4, 0.7, 0], color: 'white' })
      m.box(0.05, 0.05, 0.7, { at: [0.4, 0.7, 0], color: 'white' })
      m.box(0.72, 0.08, 0.56, { at: [0, h, 0], color: 'red' })
      m.box(0.72, 0.62, 0.07, { at: [0, h + 0.35, -0.27], color: 'red' })
      m.box(0.3, 0.08, 0.02, { at: [0, h + 0.38, -0.31], color: 'white' })
      m.box(0.08, 0.3, 0.02, { at: [0, h + 0.38, -0.31], color: 'white' })
      for (const x of [-0.36, 0.36]) m.box(0.06, 0.06, 0.5, { at: [x, h + 0.25, 0], color: 'white' })
      m.cylinder(0.015, 0.015, 0.7, { at: [0.33, h + 0.95, -0.3], color: 'white' })
      m.box(0.26, 0.17, 0.015, { at: [0.47, h + 1.2, -0.3], color: 'red' })
      m.anchor('seat', [0, h + 0.05, 0.02])
      return { carry: 'no', sit: true, solid: true }
    },
  }),
  item({
    id: 'pool-ladder',
    name: 'pool ladder',
    nameFi: 'tikkaat',
    calls: ['tikkaat', 'tikkaiden', 'tikkaita', 'tikkaille', 'tikkailla', 'tikkailta', 'tikkaisiin', 'tikapuut', 'tikapuille', 'tikapuita', 'altaan tikkaat', 'uima-altaan tikkaat', 'pool ladder', 'ladder'],
    about: "A shiny silver ladder at the pool's edge: its rails curve from the tiles ('top', at the back) over the edge and down into the water ('bottom', at the front).",
    build: (m) => {
      for (const x of [-0.25, 0.25]) m.tube([[x, 0, -0.45], [x, 0.7, -0.42], [x, 0.95, -0.25], [x, 0.9, 0], [x, 0.4, 0.12], [x, -0.7, 0.14]], 0.03, { color: CHROME })
      for (const y of [-0.15, -0.4, -0.65]) m.box(0.5, 0.04, 0.12, { at: [0, y, 0.18], color: CHROME })
      for (const x of [-0.25, 0.25]) m.cylinder(0.05, 0.05, 0.02, { at: [x, 0.01, -0.45], color: CHROME })
      m.anchor('top', [0, 0, -0.55])
      m.anchor('bottom', [0, -0.7, 0.35])
      return { carry: 'no', solid: false }
    },
  }),
]
