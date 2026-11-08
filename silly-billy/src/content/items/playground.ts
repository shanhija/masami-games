/**
 * The playground's things: the big toys built into the ground, the benches, trees and lamps
 * around them, the balls, bucket and spade a child can pick up, and the goals football puts
 * up. Bold Castle Builder colours, front toward +z, each centred on its base point so its
 * footprint is round.
 */

import type { BuiltinItem } from '../../engine/library'
import type { Vec3 } from '../../engine/types'
import { alongY, between, item, palette } from './shapes'

export const PLAYGROUND_ITEMS: BuiltinItem[] = [
  item({
    id: 'slide',
    name: 'slide',
    nameFi: 'liukumäki',
    calls: ['liukumäki', 'liukumäen', 'liukumäkeen', 'liukumäelle', 'liukumäellä', 'liukumäeltä', 'liukumäkeä', 'liukumäet', 'liukkari', 'liukuri', 'mäki', 'mäkeen', 'mäelle', 'slide'],
    about: "A playground slide: a ladder up the back (anchor 'ladder'), a deck under a red roof (anchor 'top'), and a yellow chute down the front from 'seat' to 'end'.",
    build: (m) => {
      const deck = 1.4
      for (const x of [-0.42, 0.42]) for (const z of [-1.35, -0.6]) m.cylinder(0.05, 0.05, 2.15, { at: [x, 1.075, z], color: 'blue' })
      m.box(0.95, 0.08, 0.9, { at: [0, deck, -0.975], color: palette.plank })
      for (const x of [-0.42, 0.42]) m.box(0.05, 0.05, 0.85, { at: [x, deck + 0.38, -0.975], color: 'blue' })
      m.cone(0.75, 0.5, { at: [0, 2.4, -0.975], color: 'red' })
      // The ladder leans from the ground behind up to the deck.
      for (const x of [-0.3, 0.3]) m.cylinder(0.04, 0.04, 1.47, { at: [x, deck / 2, -1.575], rot: [0.311, 0, 0], color: 'blue' })
      for (const y of [0.35, 0.7, 1.05]) m.box(0.6, 0.04, 0.06, { at: [0, y, -1.8 + (0.45 * y) / deck], color: 'yellow' })
      // The chute: down from the deck's front edge, then a short flat run at the bottom.
      const chute = between([0, deck, -0.53], [0, 0.32, 1.47])
      const tilt = Math.atan2(deck - 0.32, 2.0)
      m.box(0.62, 0.05, chute.length, { at: chute.at, rot: [tilt, 0, 0], color: 'yellow' })
      for (const x of [-0.31, 0.31]) m.box(0.05, 0.16, chute.length, { at: [x, chute.at[1] + 0.07, chute.at[2] + 0.04], rot: [tilt, 0, 0], color: 'orange' })
      m.box(0.62, 0.05, 0.4, { at: [0, 0.32, 1.67], color: 'yellow' })
      for (const x of [-0.31, 0.31]) m.box(0.05, 0.14, 0.4, { at: [x, 0.39, 1.67], color: 'orange' })
      for (const x of [-0.25, 0.25]) m.cylinder(0.04, 0.04, 0.3, { at: [x, 0.15, 1.75], color: 'blue' })
      m.anchor('seat', [0, deck + 0.05, -0.5])
      m.anchor('top', [0, deck + 0.04, -0.975])
      m.anchor('end', [0, 0.36, 1.75])
      m.anchor('ladder', [0, 0, -2.0])
      return { carry: 'no', sit: true, solid: true }
    },
  }),
  item({
    id: 'swing',
    name: 'swing',
    nameFi: 'keinu',
    calls: ['keinu', 'keinun', 'keinuun', 'keinulle', 'keinulla', 'keinua', 'keinut', 'keinuja', 'keinujen', 'keinuihin', 'keinuteline', 'keinutelineeseen', 'swing'],
    about: "A swing set: a blue frame with two red seats that swing on chains (parts 'seat1' and 'seat2', with anchors 'seat1' and 'seat2'; 'seat' is seat1). Ride it, then swing a seat with its part's rx.",
    build: (m) => {
      const top = 2.2
      m.cylinder(0.06, 0.06, 3.3, { at: [0, top, 0], rot: [0, 0, Math.PI / 2], color: 'blue' })
      for (const x of [-1.55, 1.55]) {
        // An A-frame at each end: two legs out to the front and back, and a brace.
        for (const s of [-1, 1]) m.cylinder(0.06, 0.06, 2.34, { at: [x, top / 2, s * 0.4], rot: [-s * 0.349, 0, 0], color: 'blue' })
        m.box(0.05, 0.05, 1.24, { at: [x, 0.5, 0], color: 'blue' })
      }
      for (const [name, x] of [['seat1', -0.75], ['seat2', 0.75]] as const) {
        m.part(name, { at: [x, top, 0] }, () => {
          for (const cx of [-0.22, 0.22]) m.cylinder(0.014, 0.014, 1.62, { at: [cx, -0.81, 0], color: palette.iron })
          m.box(0.5, 0.05, 0.24, { at: [0, -1.64, 0], color: 'red' })
          m.anchor(name, [0, -1.615, 0])
          if (name === 'seat1') m.anchor('seat', [0, -1.615, 0])
        })
      }
      return { carry: 'no', ride: true, sit: true, solid: true }
    },
  }),
  item({
    id: 'seesaw',
    name: 'seesaw',
    nameFi: 'keinulauta',
    calls: ['keinulauta', 'keinulaudan', 'keinulaudalle', 'keinulaudalla', 'keinulautaa', 'vipukeinu', 'vipukeinun', 'vipukeinuun', 'vipukeinulle', 'vipukeinulla', 'seesaw', 'teeter totter'],
    about: "A seesaw: a red plank (part 'plank') that tips on a blue stand, with a seat and a handle at each end (anchors 'seat1' and 'seat2'; 'seat' is seat1). Tip it with the plank's rx.",
    build: (m) => {
      const pivot = 0.45
      m.extrude([[-0.3, 0], [0.3, 0], [0.07, pivot], [-0.07, pivot]], 0.4, { rot: [0, Math.PI / 2, 0], color: 'blue' })
      m.cylinder(0.05, 0.05, 0.5, { at: [0, pivot, 0], rot: [0, 0, Math.PI / 2], color: palette.iron })
      for (const z of [-1.35, 1.35]) m.torus(0.14, 0.06, { at: [0, 0.08, z], rot: [0, Math.PI / 2, 0], color: 'black' })
      m.part('plank', { at: [0, pivot + 0.05, 0] }, () => {
        m.box(0.3, 0.07, 3.0, { color: 'red' })
        for (const s of [-1, 1]) {
          m.box(0.34, 0.05, 0.36, { at: [0, 0.06, s * 1.2], color: 'yellow' })
          m.cylinder(0.025, 0.025, 0.35, { at: [0, 0.2, s * 0.9], color: 'yellow' })
          m.cylinder(0.025, 0.025, 0.36, { at: [0, 0.37, s * 0.9], rot: [0, 0, Math.PI / 2], color: 'yellow' })
        }
        m.anchor('seat1', [0, 0.09, -1.2])
        m.anchor('seat', [0, 0.09, -1.2])
        m.anchor('seat2', [0, 0.09, 1.2])
      })
      return { carry: 'no', ride: true, sit: true, solid: true }
    },
  }),
  item({
    id: 'sandbox',
    name: 'sandbox',
    nameFi: 'hiekkalaatikko',
    calls: ['hiekkalaatikko', 'hiekkalaatikon', 'hiekkalaatikkoon', 'hiekkalaatikolle', 'hiekkalaatikossa', 'hiekkalaatikkoa', 'hiekkis', 'hiekkikseen', 'hiekkiksessä', 'hiekka', 'hiekkaan', 'hiekassa', 'hiekalle', 'sandbox', 'sandpit'],
    about: "A sandbox: a low wooden frame full of sand, with a heap and a little sand castle (anchor 'sand' on the sand; 'seat' on the front edge). People can step in.",
    build: (m) => {
      const s = 2.4
      const h = 0.25
      for (const z of [-1, 1]) m.box(s, h, 0.14, { at: [0, h / 2, z * (s / 2 - 0.07)], color: palette.plank })
      for (const x of [-1, 1]) m.box(0.14, h, s - 0.28, { at: [x * (s / 2 - 0.07), h / 2, 0], color: palette.plank })
      for (const x of [-1, 1]) for (const z of [-1, 1]) m.box(0.2, h + 0.06, 0.2, { at: [x * (s / 2 - 0.1), (h + 0.06) / 2, z * (s / 2 - 0.1)], color: 'red' })
      m.box(s - 0.28, 0.1, s - 0.28, { at: [0, 0.07, 0], color: 'sand' })
      m.sphere(0.5, { at: [-0.4, 0.1, -0.35], scale: [1.2, 0.55, 1], color: '#e3c27f' })
      m.cylinder(0.14, 0.16, 0.22, { at: [0.5, 0.23, 0.4], color: '#e3c27f' })
      m.cone(0.17, 0.18, { at: [0.5, 0.43, 0.4], color: '#e3c27f' })
      m.cylinder(0.008, 0.008, 0.16, { at: [0.5, 0.6, 0.4], color: palette.wood })
      m.box(0.1, 0.06, 0.01, { at: [0.555, 0.64, 0.4], color: 'red' })
      m.anchor('sand', [0.3, 0.12, -0.2])
      m.anchor('seat', [0, h, s / 2 - 0.07])
      return { carry: 'no', sit: true, solid: false }
    },
  }),
  item({
    id: 'climbing-frame',
    name: 'climbing frame',
    nameFi: 'kiipeilyteline',
    calls: ['kiipeilyteline', 'kiipeilytelineen', 'kiipeilytelineeseen', 'kiipeilytelineelle', 'kiipeilytelineessä', 'kiipeilytelineellä', 'kiipeilytelinettä', 'teline', 'telineeseen', 'telineelle', 'telineellä', 'kiipeilypuu', 'climbing frame', 'jungle gym'],
    about: "A climbing frame: a cube of red posts and blue and yellow bars, two metres tall, with a green deck on top (anchors 'top' and 'seat' on the deck).",
    build: (m) => {
      const s = 1.8
      const h = 2.0
      const r = 0.045
      for (const x of [-s / 2, s / 2]) for (const z of [-s / 2, s / 2]) {
        m.cylinder(r, r, h, { at: [x, h / 2, z], color: 'red' })
        m.sphere(0.07, { at: [x, h + 0.03, z], color: 'yellow' })
      }
      for (const [i, y] of [0.65, 1.3, 1.95].entries()) {
        const color = i % 2 === 0 ? 'blue' : 'yellow'
        for (const z of [-s / 2, s / 2]) m.cylinder(r, r, s, { at: [0, y, z], rot: [0, 0, Math.PI / 2], color })
        for (const x of [-s / 2, s / 2]) m.cylinder(r, r, s, { at: [x, y, 0], rot: [Math.PI / 2, 0, 0], color })
      }
      m.box(s, 0.06, s / 2, { at: [0, h - 0.02, -s / 4], color: 'green' })
      m.anchor('top', [0, h + 0.02, -s / 4])
      m.anchor('seat', [0, h + 0.02, -s / 4])
      return { carry: 'no', sit: true, solid: true }
    },
  }),
  item({
    id: 'bench',
    name: 'bench',
    nameFi: 'penkki',
    calls: ['penkki', 'penkin', 'penkille', 'penkillä', 'penkiltä', 'penkkiä', 'penkkiin', 'penkit', 'penkkejä', 'puistonpenkki', 'bench'],
    about: "A park bench: wooden slats on black legs with a back rest; sit on its 'seat', facing front.",
    build: (m) => {
      for (const x of [-0.65, 0.65]) {
        m.box(0.06, 0.45, 0.06, { at: [x, 0.225, 0.15], color: 'black' })
        m.box(0.06, 0.88, 0.06, { at: [x, 0.44, -0.18], color: 'black' })
        m.box(0.06, 0.05, 0.42, { at: [x, 0.43, -0.02], color: 'black' })
      }
      for (const z of [-0.12, 0.02, 0.16]) m.box(1.6, 0.05, 0.12, { at: [0, 0.47, z], color: palette.wood })
      for (const y of [0.66, 0.82]) m.box(1.6, 0.11, 0.04, { at: [0, y, -0.2], rot: [-0.12, 0, 0], color: palette.wood })
      m.anchor('seat', [0, 0.5, 0.02])
      return { carry: 'no', sit: true, solid: true }
    },
  }),
  item({
    id: 'roundabout',
    name: 'roundabout',
    nameFi: 'karuselli',
    calls: ['karuselli', 'karusellin', 'karuselliin', 'karusellille', 'karusellilla', 'karusellissa', 'karusellia', 'kieputin', 'kieputtimeen', 'pyöräkaruselli', 'roundabout', 'merry go round'],
    about: "A roundabout: a red disc with yellow stripes that turns round (part 'top', turn it with ry) and a blue ring to hold; ride it on its 'seat' near the edge.",
    build: (m) => {
      m.cylinder(0.3, 0.4, 0.18, { at: [0, 0.09, 0], color: palette.iron })
      m.part('top', { at: [0, 0.2, 0] }, () => {
        m.cylinder(1.2, 1.2, 0.1, { at: [0, 0.05, 0], color: 'red' })
        for (let i = 0; i < 4; i++) m.box(0.14, 0.02, 2.3, { at: [0, 0.11, 0], rot: [0, (i * Math.PI) / 4, 0], color: 'yellow' })
        m.cylinder(0.06, 0.06, 0.75, { at: [0, 0.47, 0], color: 'yellow' })
        m.torus(0.75, 0.035, { at: [0, 0.78, 0], rot: [Math.PI / 2, 0, 0], color: 'blue' })
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2 + Math.PI / 4
          const spoke = between([0, 0.78, 0], [Math.sin(a) * 0.75, 0.78, Math.cos(a) * 0.75])
          m.cylinder(0.025, 0.025, spoke.length, { at: spoke.at, rot: spoke.rot, color: 'blue' })
          m.cylinder(0.03, 0.03, 0.66, { at: [Math.sin(a) * 0.75, 0.45, Math.cos(a) * 0.75], color: 'blue' })
        }
        m.anchor('seat', [0, 0.12, 0.95])
      })
      return { carry: 'no', ride: true, sit: true, solid: true }
    },
  }),
  item({
    id: 'ball',
    name: 'ball',
    nameFi: 'pallo',
    calls: ['pallo', 'pallon', 'palloa', 'pallolla', 'pallolle', 'palloon', 'pallosta', 'pallot', 'palloja', 'palloilla', 'punainen pallo', 'ball'],
    about: 'A red play ball with a yellow stripe, very bouncy.',
    build: (m) => {
      m.sphere(0.15, { at: [0, 0.15, 0], color: 'red' })
      m.torus(0.148, 0.02, { at: [0, 0.15, 0], rot: [Math.PI / 2, 0, 0], color: 'yellow' })
      return { carry: 'hand', bouncy: 0.75, solid: false }
    },
  }),
  item({
    id: 'football',
    name: 'football',
    nameFi: 'jalkapallo',
    calls: ['jalkapallo', 'jalkapallon', 'jalkapalloa', 'jalkapallolla', 'jalkapallolle', 'jalkapalloon', 'futis', 'futiksen', 'futista', 'futispallo', 'fudis', 'football', 'soccer ball'],
    about: 'A white football with black patches.',
    build: (m) => {
      const r = 0.13
      m.sphere(r, { at: [0, r, 0], color: 'white' })
      const phi = 1.618
      for (const [x, y, z] of [[0, 1, phi], [0, 1, -phi], [0, -1, phi], [0, -1, -phi], [1, phi, 0], [-1, phi, 0], [1, -phi, 0], [-1, -phi, 0], [phi, 0, 1], [-phi, 0, 1], [phi, 0, -1], [-phi, 0, -1]] as const) {
        const l = Math.hypot(x, y, z)
        m.sphere(0.05, { at: [(x / l) * r * 0.93, r + (y / l) * r * 0.93, (z / l) * r * 0.93], scale: [1, 0.4, 1], rot: alongY([x, y, z]), color: 'black' })
      }
      return { carry: 'hand', bouncy: 0.65, solid: false }
    },
  }),
  item({
    // Football makes two and takes them away after (content/games.ts). Not solid: the ball goes in, and players run through the net.
    id: 'goal',
    name: 'goal',
    nameFi: 'maali',
    calls: ['maali', 'maalin', 'maaliin', 'maalit', 'maalille', 'maalilla', 'maalissa', 'jalkapallomaali', 'futismaali', 'goal', 'goals', 'football goal'],
    about: 'A football goal: a white frame with a net behind it, open toward +z, 2.4 m wide and 1.2 m tall.',
    build: (m) => {
      const W = 1.2
      const H = 1.2
      const D = 0.9
      const bar = { color: 'white' }
      const net = { color: '#dfe6ee' }
      const stick = (a: Vec3, b: Vec3, r: number, opts: { color: string }) => {
        const s = between(a, b)
        m.cylinder(r, r, s.length, { at: s.at, rot: s.rot, ...opts })
      }
      // The frame: two posts and the crossbar, bars on the ground back to the net's foot, and the net's sloping sides.
      for (const x of [-W, W]) {
        stick([x, 0, 0], [x, H, 0], 0.065, bar)
        stick([x, 0.04, 0], [x, 0.04, -D], 0.04, bar)
        stick([x, H, 0], [x, 0.04, -D], 0.04, bar)
      }
      stick([-W, H, 0], [W, H, 0], 0.065, bar)
      stick([-W, 0.04, -D], [W, 0.04, -D], 0.04, bar)
      // The net: strings down the sloping back and across it, and across both sides.
      for (let i = 1; i < 8; i++) {
        const x = -W + (2 * W * i) / 8
        stick([x, H, 0], [x, 0.04, -D], 0.014, net)
      }
      for (let j = 1; j < 4; j++) stick([-W, H * (1 - j / 4), (-D * j) / 4], [W, H * (1 - j / 4), (-D * j) / 4], 0.014, net)
      for (const x of [-W, W]) for (let j = 1; j < 4; j++) stick([x, (H * j) / 4, 0], [x, (H * j) / 4, -D * (1 - j / 4)], 0.014, net)
      // The goal line on the grass.
      m.box(2 * W, 0.01, 0.07, { at: [0, 0.005, 0.03], color: 'white' })
      return { carry: 'no', solid: false, bouncy: 0.3 }
    },
  }),
  item({
    id: 'bucket',
    name: 'bucket',
    nameFi: 'ämpäri',
    calls: ['ämpäri', 'ämpärin', 'ämpäriä', 'ämpäriin', 'ämpärille', 'ämpärillä', 'ämpärit', 'sanko', 'sangon', 'sankoa', 'sankoon', 'hiekkaämpäri', 'bucket', 'pail'],
    about: "A blue sand bucket with a yellow rim and handle (anchor 'hand' on the handle).",
    build: (m) => {
      m.lathe([[0, 0.01], [0.09, 0], [0.125, 0.21], [0.11, 0.21], [0.08, 0.03], [0, 0.03]], { color: 'blue' })
      m.torus(0.12, 0.014, { at: [0, 0.21, 0], rot: [Math.PI / 2, 0, 0], color: 'yellow' })
      m.tube([[-0.12, 0.2, 0], [-0.1, 0.31, 0], [0, 0.36, 0], [0.1, 0.31, 0], [0.12, 0.2, 0]], 0.012, { color: 'yellow' })
      m.anchor('hand', [0, 0.36, 0])
      return { carry: 'hand', bouncy: 0.2, solid: false }
    },
  }),
  item({
    id: 'spade',
    name: 'spade',
    nameFi: 'lapio',
    calls: ['lapio', 'lapion', 'lapiota', 'lapiolla', 'lapiolle', 'lapioon', 'lapiot', 'hiekkalapio', 'spade', 'shovel'],
    about: "A toy spade standing on its red blade, a wooden handle with a yellow grip on top (anchor 'hand').",
    build: (m) => {
      m.extrude([[-0.09, 0.2], [0.09, 0.2], [0.08, 0.04], [0, 0], [-0.08, 0.04]], 0.025, { color: 'red' })
      m.cylinder(0.018, 0.018, 0.4, { at: [0, 0.39, 0], color: palette.wood })
      m.box(0.14, 0.035, 0.035, { at: [0, 0.6, 0], color: 'yellow' })
      m.anchor('hand', [0, 0.6, 0])
      return { carry: 'hand', bouncy: 0.2, solid: false }
    },
  }),
  item({
    id: 'tree',
    name: 'tree',
    nameFi: 'puu',
    calls: ['puu', 'puun', 'puuta', 'puuhun', 'puulle', 'puulla', 'puussa', 'puusta', 'puut', 'puita', 'puihin', 'lehtipuu', 'lehtipuun', 'koivu', 'koivun', 'koivuun', 'tammi', 'tammen', 'vaahtera', 'tree'],
    about: 'A big leafy tree: a brown trunk under a round green crown, four metres tall.',
    build: (m) => {
      const trunk = 1.4
      m.cylinder(0.17, 0.26, trunk + 0.3, { at: [0, (trunk + 0.3) / 2, 0], color: palette.trunk })
      m.sphere(1.15, { at: [0, trunk + 1.0, 0], color: palette.leaves[1] })
      m.sphere(0.85, { at: [0.42, trunk + 1.75, 0.18], color: palette.leaves[0] })
      m.sphere(0.72, { at: [-0.42, trunk + 1.6, -0.3], color: palette.leaves[2] })
      return { carry: 'no', solid: true }
    },
  }),
  item({
    id: 'bush',
    name: 'bush',
    nameFi: 'pensas',
    calls: ['pensas', 'pensaan', 'pensasta', 'pensaaseen', 'pensaalle', 'pensaassa', 'pensaat', 'pensaita', 'pusikko', 'pusikkoon', 'puska', 'puskaan', 'puskassa', 'bush'],
    about: 'A round green bush, knee high.',
    build: (m) => {
      m.sphere(0.55, { at: [0, 0.45, 0], scale: [1, 0.8, 1], color: palette.leaves[1] })
      m.sphere(0.42, { at: [0.5, 0.35, 0.1], scale: [1, 0.85, 1], color: palette.leaves[0] })
      m.sphere(0.4, { at: [-0.45, 0.33, -0.05], scale: [1, 0.85, 1], color: palette.leaves[2] })
      return { carry: 'no', solid: true }
    },
  }),
  item({
    id: 'flowers',
    name: 'flowers',
    nameFi: 'kukat',
    calls: ['kukka', 'kukan', 'kukalle', 'kukkaa', 'kukat', 'kukkia', 'kukille', 'kukkien', 'kukkanen', 'kukkasen', 'kukkasia', 'kukkaset', 'kukkakimppu', 'kimppu', 'kimpun', 'kimppua', 'flowers', 'flower'],
    about: "A bunch of five flowers, red, yellow, pink, purple and orange, small enough to pick and give (anchor 'hand' on the stems).",
    build: (m) => {
      const heads = ['red', 'yellow', 'hotpink', 'purple', 'orange']
      heads.forEach((color, i) => {
        const a = (i / heads.length) * Math.PI * 2
        const tip = [Math.sin(a) * 0.13, 0.42 + (i % 2) * 0.07, Math.cos(a) * 0.13] as const
        const stem = between([0, 0, 0], [tip[0], tip[1], tip[2]])
        m.cylinder(0.012, 0.014, stem.length, { at: stem.at, rot: stem.rot, color: palette.stem })
        m.sphere(0.085, { at: [tip[0], tip[1], tip[2]], scale: [1, 0.45, 1], color })
        m.sphere(0.03, { at: [tip[0], tip[1] + 0.035, tip[2]], color: color === 'yellow' ? 'white' : 'yellow' })
      })
      for (const s of [-1, 1]) m.sphere(0.07, { at: [s * 0.07, 0.1, 0], scale: [1.6, 0.35, 0.8], rot: [0, 0, s * 0.5], color: palette.stem })
      m.anchor('hand', [0, 0.15, 0])
      return { carry: 'hand', bouncy: 0.1, solid: false }
    },
  }),
  item({
    id: 'lamp-post',
    name: 'lamp post',
    nameFi: 'katulamppu',
    calls: ['lyhtypylväs', 'lyhtypylvään', 'lyhtypylvääseen', 'lyhtypylväälle', 'lyhtypylvästä', 'katulamppu', 'katulampun', 'lamppu', 'lampun', 'lamppua', 'lamppuun', 'lyhty', 'lyhdyn', 'lyhtyä', 'valopylväs', 'pylväs', 'pylvään', 'lamp post', 'lamp'],
    about: 'A dark green park lamp post with a glowing yellow lantern on top.',
    build: (m) => {
      const post = '#2f5a3a'
      m.cylinder(0.13, 0.17, 0.2, { at: [0, 0.1, 0], color: post })
      m.cylinder(0.05, 0.065, 2.8, { at: [0, 1.5, 0], color: post })
      m.cylinder(0.12, 0.08, 0.06, { at: [0, 2.88, 0], color: post })
      m.cylinder(0.15, 0.11, 0.32, { at: [0, 3.07, 0], color: palette.window, glow: true })
      m.cone(0.23, 0.2, { at: [0, 3.33, 0], color: post })
      m.sphere(0.045, { at: [0, 3.46, 0], color: palette.gold })
      return { carry: 'no', solid: true }
    },
  }),
]
