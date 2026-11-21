import { describe, expect, it } from 'vitest'
import { DIG_SAND, FORMS, LOTS, MOBILE_PARK, PALLET_RING, PLANTS } from './map'
import { HOLD_FOR, HOP_BLOCK, NO_AIMS, blockButton, buttonStep, handsFrame } from './hands'
import type { Aims } from './hands'
import { RATES, bucketTip, craneBase, hookPoint } from './machines'
import { CARRY, MACHINE_KINDS, MIXER_SAND, SCOOP, type Digger, type MachineKind, type Sim } from './model'
import { SETTLE_BUDGET, looseVolume, settle } from './terrain'
import { beginWorld, createWorld, spawnThing, stepWorld } from './world'
import { turnTo } from './math'

const DT = 1 / 30
const FLAT = { x: 38, z: 0 }

/** An easy-mode world where only the given machines have come. */
function easyWorld(active: MachineKind, ...also: MachineKind[]): Sim {
  const s = createWorld({ storyDone: 0, moreDone: 0, coins: 0, stars: 0, mode: 'easy', seed: 7 })
  for (const m of Object.values(s.machines)) m.unlocked = false
  for (const k of [active, ...also]) s.machines[k].unlocked = true
  s.active = active
  s.machines.tower.up = 1
  return s
}

function step(s: Sim, aims: Aims = NO_AIMS, guarded = false): void {
  beginWorld(s)
  handsFrame(s, DT, guarded, aims, false)
  stepWorld(s, DT)
  settle(s.terrain, SETTLE_BUDGET)
  s.time += DT
}

/** Runs `seconds`, with the big button down on the frames `down(i)` says. */
function play(s: Sim, seconds: number, down: (i: number) => boolean, aims: Aims = NO_AIMS): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    s.hands.action = down(i)
    step(s, aims)
  }
  s.hands.action = false
}

/** A single press at the start. */
const tapOnce = (i: number) => i < 4
const held = () => true

const mass = (s: Sim) => looseVolume(s.terrain) + s.terrain.packed + s.machines.digger.load.amount + s.machines.dumper.load.amount + (s.machines.mixer.sand + s.machines.mixer.concrete * MIXER_SAND)

/** The digger facing south on flat ground with the dumper beside it, 90 degrees to its left. */
function pair(): Sim {
  const s = easyWorld('digger', 'dumper')
  const d = s.machines.digger
  d.x = FLAT.x
  d.z = FLAT.z
  d.yaw = 0
  const t = s.machines.dumper
  t.x = FLAT.x + 5.2
  t.z = FLAT.z
  t.yaw = 0
  return s
}

describe('the big button', () => {
  it('presses once on the frame it goes down, and holds as long as it is held', () => {
    const s = easyWorld('digger')
    s.hands.action = true
    const first = buttonStep(s, DT, false)
    const second = buttonStep(s, DT, false)
    expect(first).toEqual({ down: true, press: true })
    expect(second).toEqual({ down: true, press: false })
    s.hands.action = false
    expect(buttonStep(s, DT, false)).toEqual({ down: false, press: false })
    expect(s.hands.heldFor).toBe(0)
  })

  it('does nothing after a hop until it is let go and pressed again at least 0.6 s later', () => {
    const s = easyWorld('digger', 'dumper')
    s.lastHop = { from: 'digger', at: s.time }
    blockButton(s)
    expect(s.hands.blocked).toBe(true)
    s.hands.action = true
    for (let i = 0; i < 40; i++) {
      s.time += DT
      expect(buttonStep(s, DT, false).press).toBe(false)
    }
    expect(s.hands.blocked).toBe(true)
    s.hands.action = false
    buttonStep(s, DT, false)
    s.hands.action = true
    s.time += DT
    const again = buttonStep(s, DT, false)
    expect(s.time - s.lastHop.at).toBeGreaterThan(HOP_BLOCK)
    expect(again.press).toBe(true)
    expect(s.hands.blocked).toBe(false)
  })

  it('stays blocked for a fresh press that comes too soon', () => {
    const s = easyWorld('digger', 'dumper')
    s.lastHop = { from: 'digger', at: s.time }
    blockButton(s)
    s.time += 0.3
    s.hands.action = true
    expect(buttonStep(s, DT, false).press).toBe(false)
    s.hands.action = false
    buttonStep(s, DT, false)
    s.time += 0.5
    s.hands.action = true
    expect(buttonStep(s, DT, false).press).toBe(true)
  })

  it('takes a 1 s hold to drop a load away from the open step, and a short press gives uhuh', () => {
    const s = easyWorld('dumper')
    s.hands.action = true
    let pressed = 0
    for (let i = 0; i < 20; i++) {
      s.time += DT
      if (buttonStep(s, DT, true).press) pressed++
    }
    expect(pressed).toBe(0)
    expect(s.hands.heldFor).toBeCloseTo(20 * DT, 9)
    s.hands.action = false
    buttonStep(s, DT, true)
    expect(s.events.filter((e) => e.kind === 'uhuh')).toHaveLength(1)
    s.events.length = 0
    s.hands.action = true
    let downs = 0
    for (let i = 0; i < Math.round((HOLD_FOR + 0.5) / DT); i++) {
      const b = buttonStep(s, DT, true)
      if (b.press) pressed++
      if (b.down) downs++
    }
    expect(pressed).toBe(1)
    expect(downs).toBeGreaterThan(10)
    s.hands.action = false
    buttonStep(s, DT, true)
    expect(s.events).toHaveLength(0)
  })

  it('a press with no step open needing the load just does it', () => {
    const s = easyWorld('dumper')
    s.machines.dumper.load = { amount: 3, kind: 'sand' }
    s.machines.dumper.x = 20
    s.machines.dumper.z = 0
    play(s, 8, tapOnce)
    expect(s.machines.dumper.load.amount).toBe(0)
    expect(s.machines.dumper.seq).toBe('rest')
    expect(s.machines.dumper.bed).toBe(0)
  })
})

describe('the digger', () => {
  it('digs, swings, opens and closes in one press each way, in about 4 to 5 s a cycle, and never teleports a joint', () => {
    const s = pair()
    const d = s.machines.digger
    const before = mass(s)
    const starts: number[] = []
    let last = ''
    let prev = [d.swing, d.boom, d.stick, d.curl]
    const limit = [RATES.swing, RATES.boom, RATES.stick, RATES.curl]
    for (let i = 0; i < 30 * 40; i++) {
      s.hands.action = true
      step(s)
      if (d.seq !== last && d.seq === 'reach') starts.push(s.time)
      last = d.seq
      const now = [d.swing, d.boom, d.stick, d.curl]
      now.forEach((v, k) => expect(Math.abs(k === 0 ? turnTo(prev[0], v) : v - prev[k])).toBeLessThanOrEqual(limit[k] * DT + 1e-9))
      prev = now
    }
    expect(starts.length).toBeGreaterThanOrEqual(6)
    const cycles = starts.slice(1).map((t, i) => t - starts[i])
    for (const c of cycles.slice(1)) {
      expect(c).toBeGreaterThan(3.4)
      expect(c).toBeLessThan(5.6)
    }
    // each bucketful lands in the dumper (up to its cap), the rest on the ground; nothing is lost
    expect(s.machines.dumper.load.amount).toBeGreaterThan(3 * SCOOP * 0.8)
    expect(mass(s)).toBeCloseTo(before, 3)
  })

  it('dumps what it digs in the step zone into a dumper behind it, three bucketfuls in about 18 s', () => {
    const s = easyWorld('digger', 'dumper')
    const dumperHome = s.machines.dumper
    dumperHome.x = -10.5
    dumperHome.z = 8.5
    dumperHome.yaw = 0
    const aims: Aims = { ...NO_AIMS, dig: DIG_SAND }
    s.machines.digger.x = -16
    s.machines.digger.z = 8
    s.machines.digger.yaw = -Math.PI / 2
    const before = mass(s)
    play(s, 20, held, aims)
    expect(dumperHome.load.amount).toBeGreaterThan(3 * SCOOP * 0.8)
    expect(dumperHome.load.kind).toBe('sand')
    expect(mass(s)).toBeCloseTo(before, 3)
  })

  it.each([
    ['mixer', 0, 1],
    ['dumper', 1, 0],
    ['ground', 0, 0],
  ] as const)('fills only the receiver its step names (%s) with the dumper and the mixer both in reach', (into, dumperGets, mixerGets) => {
    const s = easyWorld('digger', 'dumper', 'mixer')
    const { dumper, mixer } = s.machines
    // The dumper where the first job leaves it, and the mixer where its friend stands it: the dumper's bed is the nearer receiver.
    Object.assign(dumper, { x: -10.5, z: 8.5, yaw: 0 })
    Object.assign(mixer, { x: -19, z: 12.8, yaw: -Math.PI / 2 })
    Object.assign(s.machines.digger, { x: -15.2, z: 7, yaw: -Math.PI / 2 })
    const before = mass(s)
    play(s, 20, held, { ...NO_AIMS, dig: DIG_SAND, into })
    expect(dumper.load.amount > 1, `dumper filled: ${dumper.load.amount.toFixed(1)}`).toBe(dumperGets === 1)
    expect(mixer.sand > 1, `mixer filled: ${mixer.sand.toFixed(1)}`).toBe(mixerGets === 1)
    if (into === 'dumper') expect(mixer.sand).toBe(0)
    if (into === 'mixer') expect(dumper.load.amount).toBe(0)
    expect(mass(s)).toBeCloseTo(before, 3)
  })

  it('digs anywhere, even on flat ground with no step', () => {
    const s = easyWorld('digger')
    s.machines.digger.x = FLAT.x
    s.machines.digger.z = FLAT.z
    play(s, 6, tapOnce)
    expect(s.machines.digger.seq).toBe('hold')
    expect(s.machines.digger.load.amount).toBeGreaterThan(1.5)
  })

  it('mashing the button changes nothing a held button would not', () => {
    const run = (down: (i: number) => boolean) => {
      const s = pair()
      play(s, 12, down)
      play(s, 14, () => false)
      return s
    }
    const mash = run((i) => i % 4 < 2)
    const hold = run(held)
    for (const s of [mash, hold]) {
      expect(['rest', 'hold']).toContain(s.machines.digger.seq)
      expect(Number.isFinite(s.machines.digger.swing)).toBe(true)
    }
    expect(Math.abs(mash.machines.dumper.load.amount - hold.machines.dumper.load.amount)).toBeLessThanOrEqual(SCOOP + 0.01)
  })

  it('a press during a sequence is remembered once and runs when it ends', () => {
    const s = pair()
    play(s, 0.3, tapOnce)
    expect(s.machines.digger.seq).toBe('reach')
    play(s, 0.2, () => false)
    play(s, 0.1, () => true)
    play(s, 0.1, () => false)
    play(s, 8, () => false)
    // one tap at the start and one during the sequence: dug, dumped, and nothing more
    expect(s.machines.digger.load.amount).toBe(0)
    expect(s.machines.dumper.load.amount).toBeGreaterThan(1.5)
    expect(s.machines.dumper.load.amount).toBeLessThan(SCOOP + 0.2)
  })

  it('finishes its sequence after the child hops away, and stops', () => {
    const s = pair()
    play(s, 0.3, tapOnce)
    s.active = 'dumper'
    s.hands.action = false
    play(s, 14, () => false)
    expect(['rest', 'hold']).toContain(s.machines.digger.seq)
    const d = s.machines.digger as Digger
    expect(Math.abs(d.boom - CARRY.boom)).toBeLessThan(0.06)
    expect(Math.abs(d.stick - CARRY.stick)).toBeLessThan(0.06)
  })

  it('a thenPress goal makes the digger dig when it arrives', () => {
    const s = easyWorld('digger')
    const d = s.machines.digger
    d.x = FLAT.x - 20
    d.z = FLAT.z
    d.goal = { x: FLAT.x, z: FLAT.z, within: 1, reverse: false, thenPress: true, yaw: null, pace: 1 }
    play(s, 14, () => false)
    expect(d.goal).toBeNull()
    expect(d.seq).toBe('hold')
    expect(d.load.amount).toBeGreaterThan(1.5)
  })
})

describe('the dumper', () => {
  it('backs to the feed spot in a plant ring, tips into the hopper and comes down', () => {
    const s = easyWorld('dumper')
    const p = PLANTS.press
    const m = s.machines.dumper
    m.x = p.ring.x + 3
    m.z = p.ring.z + 2
    m.yaw = 2
    m.load = { amount: 3, kind: 'sand' }
    play(s, 25, tapOnce)
    expect(m.seq).toBe('rest')
    expect(m.bed).toBe(0)
    expect(Math.hypot(m.x - p.feedSpot.x, m.z - p.feedSpot.z)).toBeLessThan(1.2)
    expect(s.plants.press.stored + s.plants.press.made * p.need).toBeCloseTo(3, 5)
  })

  it('a thenPress goal tips on arrival', () => {
    const s = easyWorld('dumper')
    const m = s.machines.dumper
    m.x = 10
    m.z = 0
    m.load = { amount: 4, kind: 'sand' }
    m.goal = { x: 25, z: 10, within: 1.5, reverse: false, thenPress: true, yaw: null, pace: 1 }
    play(s, 20, () => false)
    expect(m.load.amount).toBe(0)
  })

  it('a tap on the ground while it backs in takes over at once', () => {
    const s = easyWorld('dumper')
    const p = PLANTS.press
    const m = s.machines.dumper
    m.x = p.ring.x + 3
    m.z = p.ring.z + 2
    m.load = { amount: 3, kind: 'sand' }
    play(s, 0.3, tapOnce)
    expect(m.seq).toBe('turn')
    m.goal = { x: 0, z: 0, within: 2, reverse: false, thenPress: false, yaw: null, pace: 1 }
    play(s, 1, () => false)
    expect(m.seq).toBe('rest')
    expect(m.load.amount).toBe(3)
  })
})

describe('the forklift', () => {
  it('seeks a pallet within 5 m, raises it, and lowers and drops it on the next press', () => {
    const s = easyWorld('forklift')
    const m = s.machines.forklift
    m.x = -11
    m.z = 0
    m.yaw = Math.PI / 2
    const t = spawnThing(s, 'bricks', -7, 3)
    play(s, 6, tapOnce)
    expect(m.holding).toBe(t.id)
    expect(m.lift).toBeGreaterThan(0.4)
    play(s, 4, (i) => i < 4)
    expect(m.holding).toBe(-1)
    expect(t.heldBy).toBeNull()
    expect(m.seq).toBe('rest')
  })

  it('says uhuh when there is nothing within 5 m', () => {
    const s = easyWorld('forklift')
    spawnThing(s, 'bricks', 20, 20)
    play(s, 1, tapOnce)
    expect(s.events.some((e) => e.kind === 'uhuh')).toBe(true)
    expect(s.machines.forklift.seq).toBe('rest')
  })
})

describe('the dozer blade', () => {
  it('lifts by itself when the step says the dozer is going back, drops when it does not, and the button still lifts it', () => {
    const s = easyWorld('dozer')
    const m = s.machines.dozer
    const back: Aims = { ...NO_AIMS, bladeUp: true }
    for (let i = 0; i < 90; i++) step(s, back)
    expect(m.blade).toBeGreaterThan(0.95)
    for (let i = 0; i < 90; i++) step(s, NO_AIMS)
    expect(m.blade).toBeLessThan(0.05)
    play(s, 1.5, held)
    expect(m.blade).toBeGreaterThan(0.95)
  })
})

describe('the cranes', () => {
  it('a tower grabs the next thing the lift step wants, carries it to the next open spot and places it', () => {
    const s = easyWorld('tower')
    s.builds[0].shown = true
    const t = spawnThing(s, 'bricks', PALLET_RING.x - 1.2, PALLET_RING.z - 1.2)
    const aims: Aims = { dig: null, into: null, thing: t, spot: s.builds[0].spots[0], bladeUp: false }
    play(s, 14, (i) => i < 4 || (i > 200 && i < 204), aims)
    expect(t.gone).toBe(true)
    expect(s.builds[0].placed).toBe(1)
    expect(s.machines.tower.holding).toBe(-1)
  })

  it('a tower with a tapped point puts the hook over it, and the next press lets go there', () => {
    const s = easyWorld('tower')
    const t = spawnThing(s, 'planks', 4, -10)
    s.machines.tower.holding = t.id
    t.heldBy = 'tower'
    s.hands.point = { x: 30, z: 6 }
    play(s, 0.3, () => false)
    s.hands.point = null
    play(s, 9, () => false)
    const m = s.machines.tower
    expect(Math.hypot(m.x + Math.sin(m.jib) * m.trolley - 30, m.z + Math.cos(m.jib) * m.trolley - 6)).toBeLessThan(0.7)
    expect(m.holding).toBe(t.id)
    play(s, 8, tapOnce)
    expect(m.holding).toBe(-1)
    expect(Math.hypot(t.x - 30, t.z - 6)).toBeLessThan(0.7)
  })

  it('a tap while the hook is still rising after a pick goes over that point once the rise is done, and a drop there needs no second tap', () => {
    const s = easyWorld('tower')
    const m = s.machines.tower
    const t = spawnThing(s, 'planks', 4, -10)
    const aims: Aims = { dig: null, into: null, thing: t, spot: null, bladeUp: false }
    s.hands.point = { x: 4, z: -10 }
    play(s, 0.3, () => false, aims)
    s.hands.point = null
    play(s, 4, () => false, aims)
    play(s, 6, tapOnce, aims)
    expect(m.holding).toBe(t.id)
    let guard = 0
    while (m.seq !== 'raise' && guard++ < 600) play(s, DT, () => false, aims)
    s.hands.point = { x: 30, z: 6 }
    play(s, DT, () => false, aims)
    s.hands.point = null
    play(s, 6, () => false, aims)
    expect(Math.hypot(m.x + Math.sin(m.jib) * m.trolley - 30, m.z + Math.cos(m.jib) * m.trolley - 6)).toBeLessThan(0.7)
    play(s, 8, tapOnce, aims)
    expect(m.holding).toBe(-1)
    expect(Math.hypot(t.x - 30, t.z - 6)).toBeLessThan(0.7)
  })

  it('a piece takes about 7 seconds from the hook leaving the spot of the last one to the next one set, the hook travelling the whole way', () => {
    const s = easyWorld('tower')
    s.builds[0].shown = true
    const m = s.machines.tower
    const things = [0, 1, 2].map((k) => spawnThing(s, 'bricks', PALLET_RING.x - 1.2 + k * 0.1, PALLET_RING.z - 1.2))
    let placed = 0
    let at = 0
    const marks: number[] = []
    let jump = 0
    let last = { x: m.trolley, y: m.hookY, jib: m.jib }
    for (let i = 0; i < 30 * 60 && placed < 3; i++) {
      const next = things.find((o) => !o.gone) ?? null
      const aims: Aims = { dig: null, into: null, thing: next, spot: s.builds[0].placed < s.builds[0].spots.length ? s.builds[0].spots[s.builds[0].placed] : null, bladeUp: false }
      s.hands.action = m.seq === 'rest' && i % 40 < 3
      step(s, aims)
      jump = Math.max(jump, Math.abs(m.trolley - last.x), Math.abs(m.hookY - last.y))
      last = { x: m.trolley, y: m.hookY, jib: m.jib }
      if (s.builds[0].placed > placed) {
        placed = s.builds[0].placed
        marks.push(s.time - at)
        at = s.time
      }
    }
    expect(placed).toBe(3)
    for (const piece of marks.slice(1)) expect(piece).toBeLessThan(9)
    // The hook never jumps: no frame moves it more than its top speed allows.
    expect(jump).toBeLessThan(RATES.tower.hook * DT * 1.01 + 1e-6)
  })

  it('a truck crane drives closer to a thing out of reach, puts its legs down and picks it up', () => {
    const s = easyWorld('mobile')
    const m = s.machines.mobile
    m.x = MOBILE_PARK.x
    m.z = MOBILE_PARK.z
    m.yaw = MOBILE_PARK.yaw
    const t = spawnThing(s, 'pier', 8, 10)
    play(s, 40, (i) => i < 4, { dig: null, into: null, thing: t, spot: null, bladeUp: false })
    expect(t.heldBy).toBe('mobile')
    expect(m.holding).toBe(t.id)
    expect(m.legs).toBe(1)
    expect(Math.hypot(m.x - 8, m.z - 10)).toBeLessThan(17)
  })

  it('says uhuh with nothing to grab', () => {
    const s = easyWorld('tower')
    play(s, 0.5, tapOnce)
    expect(s.events.some((e) => e.kind === 'uhuh')).toBe(true)
  })
})

describe('the other machines', () => {
  it('the dozer holds its blade up only while the button is held, and lifts it going backward', () => {
    const s = easyWorld('dozer')
    const m = s.machines.dozer
    m.x = 20
    m.z = 0
    play(s, 2, () => false)
    expect(m.blade).toBe(0)
    play(s, 2, held)
    expect(m.blade).toBe(1)
    play(s, 2, () => false)
    expect(m.blade).toBe(0)
    m.goal = { x: 20, z: -12, within: 1, reverse: true, thenPress: false, yaw: null, pace: 1 }
    play(s, 1.5, () => false)
    expect(m.blade).toBeGreaterThan(0.5)
  })

  it('the roller stomps on a press', () => {
    const s = easyWorld('roller')
    play(s, 0.3, tapOnce)
    expect(s.events.some((e) => e.kind === 'stomp')).toBe(true)
  })

  it('the semi unloads at the saw ring and says uhuh anywhere else', () => {
    const s = easyWorld('semi')
    const m = s.machines.semi
    m.logs = 1
    m.x = 20
    m.z = 0
    play(s, 0.3, tapOnce)
    expect(m.seq).toBe('rest')
    expect(s.events.some((e) => e.kind === 'uhuh')).toBe(true)
    m.x = PLANTS.saw.ring.x
    m.z = PLANTS.saw.ring.z
    play(s, 4, tapOnce)
    expect(m.logs).toBe(0)
    expect(s.plants.saw.made).toBe(1)
  })

  it('the mixer backs to a shown form, pours into it, and says uhuh with nothing to pour', () => {
    const s = easyWorld('mixer')
    const m = s.machines.mixer
    const lot = LOTS[FORMS[0].lot]
    m.x = lot.x + 12
    m.z = lot.z + 12
    play(s, 0.3, tapOnce)
    expect(s.events.some((e) => e.kind === 'uhuh')).toBe(true)
    m.concrete = 1
    s.forms[0].shown = true
    play(s, 25, tapOnce)
    expect(m.concrete).toBe(0)
    expect(s.forms[0].fill).toBeGreaterThan(0.99)
    expect(m.chute).toBe(0)
  })
})

describe('a press from every state', () => {
  const states: Record<MachineKind, readonly string[]> = {
    digger: ['rest', 'reach', 'bite', 'lift', 'hold', 'swing', 'open', 'close'],
    dumper: ['rest', 'turn', 'up', 'down'],
    dozer: [],
    roller: [],
    mixer: ['rest', 'turn', 'pour'],
    forklift: ['rest', 'seek', 'raise', 'lower'],
    tower: ['rest', 'over', 'lower', 'raise'],
    semi: ['rest', 'unload'],
    mobile: ['rest', 'drive', 'legs', 'over', 'lower', 'raise'],
  }
  for (const kind of MACHINE_KINDS) {
    for (const seq of states[kind]) {
      it(`${kind} in ${seq} ends at rest`, () => {
        const s = easyWorld(kind)
        const m = s.machines[kind]
        m.x = 20
        m.z = 0
        spawnThing(s, 'bricks', 22, 3)
        if (m.kind === 'digger' || m.kind === 'dumper') m.load = { amount: 1.5, kind: 'sand' }
        if (m.kind === 'mixer') m.concrete = 0.5
        if (m.kind === 'semi') m.logs = 0.5
        ;(m as { seq: string }).seq = seq
        play(s, 30, (i) => i % 60 < 4)
        play(s, 20, () => false)
        const end = (m as { seq: string }).seq
        expect(['rest', 'hold'], `${kind} ended in ${end}`).toContain(end)
        for (const v of [m.x, m.y, m.z, m.yaw, m.speed]) expect(Number.isFinite(v)).toBe(true)
      })
    }
  }
})

describe('pro levers turn the way the steering keys do', () => {
  /** Pro with `kind` active, ground flat, and the levers held for `seconds`. */
  function held1(kind: MachineKind, levers: Partial<Sim['hands']['levers']>, seconds: number): Sim {
    const s = easyWorld(kind)
    s.mode = 'pro'
    const m = s.machines[kind]
    m.x = FLAT.x
    m.z = FLAT.z
    m.yaw = 0.7
    if (m.kind === 'mobile') m.legs = 1
    // A jib that starts pointing straight south turns to a negative world yaw when it turns right and to a positive one when it turns left: whichever way it was put up, the test sees the lever's sign.
    if (m.kind === 'tower' || m.kind === 'mobile') m.jib = 0
    s.hands.levers = { drive: 0, steer: 0, a: 0, b: 0, c: 0, d: 0, ...levers }
    for (let i = 0; i < Math.round(seconds / DT); i++) step(s)
    return s
  }
  /** How far right of the machine's heading a point is (right of facing (sin, cos) is (-cos, sin)). */
  const rightOf = (m: { yaw: number }, from: { x: number; z: number }, p: { x: number; z: number }) => (p.x - from.x) * -Math.cos(m.yaw) + (p.z - from.z) * Math.sin(m.yaw)

  it('a held +a swings the digger arm to its right, and a held D (steer -1) turns it right', () => {
    const s = held1('digger', { a: 1 }, 0.4)
    const m = s.machines.digger
    expect(rightOf(m, m, bucketTip(m))).toBeGreaterThan(1)
    const turned = held1('dumper', { drive: 1, steer: -1 }, 1.5).machines.dumper
    expect(turnTo(0.7, turned.yaw)).toBeLessThan(-0.05)
    // the arm swings the same way the dumper turns
    expect(m.swing).toBeLessThan(0)
  })

  it('a held +a swings the tower crane jib to its right', () => {
    const m = held1('tower', { a: 1 }, 0.4).machines.tower
    expect(m.jib).toBeLessThan(-0.3)
    expect(rightOf({ yaw: 0 }, craneBase(m), hookPoint(m))).toBeGreaterThan(1)
  })

  it('a held +a swings the truck crane jib to its right of its heading', () => {
    const s = held1('mobile', { a: 1 }, 0.4)
    const m = s.machines.mobile
    expect(m.jib).toBeLessThan(-0.3)
    expect(rightOf({ yaw: 0 }, craneBase(m), hookPoint(m))).toBeGreaterThan(1)
  })

  it('the bed lever keeps its sign', () => {
    expect(held1('dumper', { a: 1 }, 0.5).machines.dumper.bed).toBeGreaterThan(0.3)
  })
})
