/**
 * The forest's things: pines and boulders that frame it, logs and stumps to sit on, big red
 * mushrooms, a tent, a campfire whose flames flicker by themselves, and the pinecones,
 * sticks, flowers and berries a child finds on the ground. The pond is the ground's.
 */

import type { BuiltinItem } from '../../engine/library'
import { alongY, between, dotsOn, item, palette } from './shapes'

const FLAMES = ['flame1', 'flame2', 'flame3'] as const

export const FOREST_ITEMS: BuiltinItem[] = [
  item({
    id: 'pine',
    name: 'pine',
    nameFi: 'kuusi',
    calls: ['mänty', 'männyn', 'mäntyä', 'mäntyyn', 'männylle', 'männyt', 'mäntyjä', 'kuusi', 'kuusen', 'kuusta', 'kuuseen', 'kuuselle', 'kuuset', 'kuusia', 'havupuu', 'havupuun', 'pine', 'pine tree', 'spruce', 'fir'],
    about: 'A tall dark green pine: a short brown trunk under three stacked cones, over four metres tall.',
    build: (m) => {
      m.cylinder(0.16, 0.24, 1.2, { at: [0, 0.6, 0], color: palette.trunk })
      for (const [i, { r, h, y }] of [{ r: 1.4, h: 1.8, y: 1.0 }, { r: 1.1, h: 1.6, y: 2.0 }, { r: 0.75, h: 1.4, y: 2.95 }].entries()) {
        m.cone(r, h, { at: [0, y + h / 2, 0], color: palette.leaves[(i + 2) % 3] })
      }
      return { carry: 'no', solid: true }
    },
  }),
  item({
    id: 'rock',
    name: 'rock',
    nameFi: 'kivi',
    calls: ['kivi', 'kiven', 'kiveä', 'kivelle', 'kivellä', 'kiveltä', 'kiveen', 'kivet', 'kiviä', 'kiviin', 'kallio', 'kallion', 'kalliolle', 'kalliolla', 'lohkare', 'lohkareen', 'järkäle', 'rock', 'stone', 'boulder'],
    about: "A grey boulder, knee high, with two smaller stones at its foot; sit on its 'seat'.",
    build: (m) => {
      m.sphere(0.55, { at: [0, 0.32, 0], scale: [1.2, 0.75, 1], rot: [0.2, 0.5, 0.1], color: palette.rock })
      m.sphere(0.35, { at: [0.5, 0.22, 0.2], scale: [1, 0.8, 1.1], rot: [0, 1, 0.3], color: palette.rockDark })
      m.sphere(0.25, { at: [-0.45, 0.15, 0.25], scale: [1, 0.7, 1], rot: [0.4, 0.2, 0], color: palette.rock })
      m.anchor('seat', [0, 0.72, 0])
      return { carry: 'no', sit: true, solid: true }
    },
  }),
  item({
    id: 'log',
    name: 'log',
    nameFi: 'tukki',
    calls: ['tukki', 'tukin', 'tukkia', 'tukille', 'tukilla', 'tukilta', 'tukkiin', 'tukit', 'pölkky', 'pölkyn', 'pölkylle', 'pölkyllä', 'hirsi', 'hirren', 'hirrelle', 'runko', 'rungon', 'rungolle', 'rungolla', 'puunrunko', 'kaatunut puu', 'log'],
    about: "A fallen log lying on its side, a stub of a branch and some moss on top; sit on its 'seat'.",
    build: (m) => {
      m.cylinder(0.24, 0.24, 1.8, { at: [0, 0.24, 0], rot: [0, 0, Math.PI / 2], color: palette.trunk })
      for (const x of [-0.905, 0.905]) {
        m.cylinder(0.2, 0.2, 0.02, { at: [x, 0.24, 0], rot: [0, 0, Math.PI / 2], color: palette.stump })
        m.torus(0.1, 0.015, { at: [x * 1.012, 0.24, 0], rot: [0, Math.PI / 2, 0], color: palette.trunk })
      }
      const branch = between([0.3, 0.4, 0.05], [0.42, 0.68, 0.16])
      m.cylinder(0.05, 0.07, branch.length, { at: branch.at, rot: branch.rot, color: palette.trunk })
      m.sphere(0.16, { at: [-0.32, 0.45, 0], scale: [1.6, 0.4, 1.2], color: palette.leaves[0] })
      m.anchor('seat', [0, 0.48, 0])
      return { carry: 'no', sit: true, solid: true }
    },
  }),
  item({
    id: 'stump',
    name: 'stump',
    nameFi: 'kanto',
    calls: ['kanto', 'kannon', 'kantoa', 'kannolle', 'kannolla', 'kannolta', 'kantoon', 'kannot', 'kantoja', 'puunkanto', 'stump', 'tree stump'],
    about: "A tree stump with a pale cut top and roots at its foot; sit on its 'seat'.",
    build: (m) => {
      m.cylinder(0.32, 0.4, 0.5, { at: [0, 0.25, 0], color: palette.trunk })
      m.cylinder(0.31, 0.31, 0.02, { at: [0, 0.505, 0], color: palette.stump })
      m.torus(0.17, 0.015, { at: [0, 0.52, 0], rot: [Math.PI / 2, 0, 0], color: palette.trunk })
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4
        m.sphere(0.13, { at: [Math.sin(a) * 0.42, 0.05, Math.cos(a) * 0.42], scale: [0.8, 0.55, 1.7], rot: [0, a, 0], color: palette.trunk })
      }
      m.anchor('seat', [0, 0.53, 0])
      return { carry: 'no', sit: true, solid: true }
    },
  }),
  item({
    id: 'mushroom',
    name: 'mushroom',
    nameFi: 'sieni',
    calls: ['sieni', 'sienen', 'sientä', 'sienelle', 'sienellä', 'sieneen', 'sienet', 'sieniä', 'sienten', 'kärpässieni', 'kärpässienen', 'kärpässientä', 'punainen sieni', 'mushroom', 'toadstool'],
    about: 'A big fairy-tale mushroom: a red cap with white spots on a cream stem, a hug to carry.',
    build: (m) => {
      m.cylinder(0.09, 0.12, 0.36, { at: [0, 0.18, 0], color: 'cream' })
      m.lathe([[0, 0.6], [0.14, 0.59], [0.25, 0.54], [0.32, 0.45], [0.33, 0.38], [0.1, 0.35], [0, 0.35]], { color: 'red' })
      for (const dot of dotsOn([0, 0.35, 0], [0.36, 0.26, 0.36], 22, (d) => d[1] > 0.3)) m.sphere(0.045, { at: dot.at, rot: dot.rot, scale: [1, 0.35, 1], color: 'white' })
      m.anchor('hand', [0, 0.2, 0])
      return { carry: 'hug', bouncy: 0.3, solid: false, food: 'poison' }
    },
  }),
  item({
    id: 'tent',
    name: 'tent',
    nameFi: 'teltta',
    calls: ['teltta', 'teltan', 'telttaa', 'telttaan', 'teltalle', 'teltalla', 'teltassa', 'teltasta', 'teltat', 'telttoja', 'tent'],
    about: "An orange camping tent with a dark door at the front (anchor 'door' just outside it; 'seat' inside).",
    build: (m) => {
      const w = 1.7
      const h = 1.35
      const d = 2.0
      m.box(w + 0.25, 0.03, d + 0.2, { at: [0, 0.015, 0], color: 'darkgreen' })
      m.extrude([[-w / 2, 0], [w / 2, 0], [0, h]], d, { at: [0, 0.03, 0], color: 'orange' })
      m.extrude([[-0.4, 0], [0.4, 0], [0, 0.98]], 0.02, { at: [0, 0.035, d / 2 + 0.01], color: '#5a3a24' })
      for (const z of [-d / 2, d / 2]) {
        m.cylinder(0.025, 0.025, 0.3, { at: [0, h + 0.15, z], color: palette.wood })
        const rope = between([0, h + 0.2, z], [0, 0.02, z * 1.6])
        m.cylinder(0.008, 0.008, rope.length, { at: rope.at, rot: rope.rot, color: 'white' })
      }
      m.anchor('door', [0, 0, d / 2 + 0.35])
      m.anchor('seat', [0, 0.05, 0])
      return { carry: 'no', sit: true, solid: true }
    },
  }),
  item({
    id: 'campfire',
    name: 'campfire',
    nameFi: 'nuotio',
    calls: ['nuotio', 'nuotion', 'nuotiota', 'nuotiolle', 'nuotiolla', 'nuotiolta', 'nuotioon', 'nuotiot', 'leirinuotio', 'leirinuotion', 'kokko', 'kokon', 'kokolle', 'campfire', 'fire', 'bonfire'],
    about: "A campfire: grey stones in a ring, three logs leaning together, glowing embers and three flames (parts 'flame1', 'flame2', 'flame3') that flicker and puff smoke by themselves.",
    build: (m) => {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2
        m.sphere(0.11, { at: [Math.sin(a) * 0.45, 0.07, Math.cos(a) * 0.45], scale: [1, 0.7, 1], rot: [0, a, 0], color: i % 3 === 0 ? palette.rockDark : palette.rock })
      }
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.5
        const log = between([Math.sin(a) * 0.36, 0.04, Math.cos(a) * 0.36], [Math.sin(a) * 0.04, 0.34, Math.cos(a) * 0.04])
        m.cylinder(0.05, 0.06, log.length, { at: log.at, rot: log.rot, color: palette.trunk })
      }
      m.sphere(0.2, { at: [0, 0.04, 0], scale: [1, 0.3, 1], color: palette.fire[0], glow: true })
      for (const [i, name] of FLAMES.entries()) {
        const at = [[0, 0.08, 0], [0.07, 0.08, 0.05], [-0.07, 0.08, -0.04]][i]
        m.part(name, { at }, () => m.cone(0.2 - i * 0.055, 0.6 - i * 0.14, { at: [0, 0.3 - i * 0.07, 0], color: palette.fire[i], glow: true }))
      }
      return { carry: 'no', solid: true, bouncy: 0, temp: 'hot' }
    },
    tick: (it, w, dt) => {
      for (const [i, name] of FLAMES.entries()) {
        const p = it.part(name)
        const f = w.t * (7 + i * 2.3) + i * 1.7
        p.s = 0.88 + 0.18 * Math.sin(f) + 0.07 * Math.sin(f * 2.7)
        p.ry = 0.4 * Math.sin(f * 0.5)
        p.rz = 0.08 * Math.sin(f * 1.3)
      }
      const top = { x: it.x, y: it.y + 0.75 * it.scale, z: it.z }
      if (w.random() < dt * 2.5) w.puff({ ...top, kind: 'smoke', color: palette.smoke, count: 1, size: 0.2, speed: 0.15, up: 0.6, life: 1.8, gravity: -0.15 })
      if (w.random() < dt * 1.5) w.puff({ ...top, kind: 'spark', color: palette.fire[2], count: 1, size: 0.06, speed: 0.6, up: 1.2, life: 0.7, gravity: 1 })
    },
  }),
  item({
    id: 'pinecone',
    name: 'pinecone',
    nameFi: 'käpy',
    calls: ['käpy', 'kävyn', 'käpyä', 'kävylle', 'kävyllä', 'käpyyn', 'kävyt', 'käpyjä', 'käpyjen', 'kuusenkäpy', 'männynkäpy', 'pinecone', 'pine cone', 'cone'],
    about: 'A small brown pinecone lying on the ground.',
    build: (m) => {
      m.sphere(0.06, { at: [0, 0.055, 0], scale: [0.85, 0.85, 1.5], color: palette.trunk })
      for (const z of [-0.05, 0, 0.05]) m.torus(0.05 - Math.abs(z) * 0.3, 0.013, { at: [0, 0.055, z], color: '#6b4a2b' })
      m.cylinder(0.008, 0.008, 0.035, { at: [0, 0.055, -0.1], rot: [Math.PI / 2, 0, 0], color: '#5a3a24' })
      return { carry: 'hand', bouncy: 0.35, solid: false, food: 'yucky' }
    },
  }),
  item({
    id: 'stick',
    name: 'stick',
    nameFi: 'keppi',
    calls: ['keppi', 'kepin', 'keppiä', 'kepille', 'kepillä', 'keppiin', 'kepit', 'keppejä', 'tikku', 'tikun', 'tikkua', 'oksa', 'oksan', 'oksaa', 'oksalla', 'oksia', 'risu', 'risun', 'risuja', 'kapula', 'kapulan', 'stick', 'branch', 'twig'],
    about: "A long brown stick lying on the ground, with a twig and a leaf; held at its back end (anchor 'hand'), it points forward.",
    build: (m) => {
      m.cylinder(0.022, 0.03, 0.9, { at: [0, 0.03, 0], rot: [Math.PI / 2, 0, 0], color: palette.trunk })
      const twig = between([0, 0.03, 0.1], [0.16, 0.03, 0.3])
      m.cylinder(0.012, 0.016, twig.length, { at: twig.at, rot: twig.rot, color: palette.trunk })
      m.sphere(0.045, { at: [0.19, 0.03, 0.34], rot: alongY([0.6, 0, 1]), scale: [0.6, 1.6, 0.25], color: palette.leaves[1] })
      m.anchor('hand', [0, 0.03, -0.38])
      return { carry: 'hand', bouncy: 0.3, solid: false, food: 'yucky' }
    },
  }),
  item({
    id: 'flower-patch',
    name: 'flower patch',
    nameFi: 'kukkapenkki',
    calls: ['kukkapenkki', 'kukkapenkin', 'kukkapenkkiin', 'kukkapenkille', 'kukkapenkissä', 'kukkamätäs', 'kukkamättään', 'kukkaketo', 'kukkakedolle', 'kukkaniitty', 'niitty', 'niityn', 'niitylle', 'niityllä', 'flower patch', 'flower bed', 'meadow'],
    about: 'A patch of wildflowers in red, yellow, blue and purple among tufts of grass, growing on the ground; people walk through it.',
    build: (m) => {
      for (let i = 0; i < 9; i++) {
        const a = i * 2.39996
        const d = 0.12 + 0.065 * i
        const x = Math.cos(a) * d
        const z = Math.sin(a) * d
        const h = 0.28 + (i % 3) * 0.07
        m.cylinder(0.012, 0.014, h, { at: [x, h / 2, z], color: palette.stem })
        m.sphere(0.075, { at: [x, h, z], scale: [1, 0.5, 1], color: palette.dye[i % 4] })
        m.sphere(0.025, { at: [x, h + 0.03, z], color: i % 4 === 1 ? 'white' : 'yellow' })
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.5
        m.cone(0.09, 0.22, { at: [Math.sin(a) * 0.5, 0.11, Math.cos(a) * 0.5], color: palette.leaves[i % 3] })
      }
      return { carry: 'no', solid: false, food: 'yucky' }
    },
  }),
  item({
    id: 'berry-bush',
    name: 'berry bush',
    nameFi: 'marjapensas',
    calls: ['marjapensas', 'marjapensaan', 'marjapensasta', 'marjapensaalle', 'marjapensaaseen', 'marjapensaat', 'mustikkapensas', 'mustikka', 'mustikan', 'mustikoita', 'mustikat', 'puolukka', 'vadelma', 'marja', 'marjan', 'marjat', 'marjoja', 'berry bush', 'berries'],
    about: 'A round dark green bush covered in red berries.',
    build: (m) => {
      m.sphere(0.6, { at: [0, 0.55, 0], scale: [1, 0.9, 1], color: palette.leaves[2] })
      m.sphere(0.4, { at: [0.45, 0.35, 0.15], color: palette.leaves[0] })
      m.sphere(0.38, { at: [-0.42, 0.33, -0.12], color: palette.leaves[1] })
      for (const berry of dotsOn([0, 0.55, 0], [0.6, 0.54, 0.6], 30, (d) => d[1] > -0.1)) m.sphere(0.05, { at: berry.at, color: 'red' })
      return { carry: 'no', solid: true, food: 'yummy' }
    },
  }),
]
