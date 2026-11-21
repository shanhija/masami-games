import { HUES, type Course, type CourseId, type Gate, type Ground, type Hue, type Puppy, type Slider, type Spinner, type Spot } from './model'

/**
 * The map legend, one character per tile:
 *
 *   ~ water   . grass   , path   * flowers   = bridge   # hedge   T tree   r rock
 *   S the start   @ the balloon's middle   F a flag   o a food   x a poop
 *   P G B a pink, green or blue gate tile (a straight run of one to three is one gate)
 *   p g b a pink, green or blue button
 *   1 to 9 a pole: a spinner's post or a slider's middle, its numbers beside the map
 *   d where a puppy starts (its path is beside the map)
 *
 * A thing stands on the ground most of its four neighbours have (bridge before path before
 * flowers before grass before water on a tie), so a food on a bridge lies on planks.
 */
export interface CourseText {
  id: CourseId
  map: readonly string[]
  /** Each digit on the map: a spinner turning round it, or a slider gliding across it from (-dx, -dy) to (dx, dy) and back. */
  poles: Readonly<Record<string, SpinnerText | SliderText>>
  /** Seconds a gate of a hue stays open; a hue left out stays open for good. */
  openFor: Partial<Record<Hue, number>>
  /** Each puppy's path as tile columns and rows, the first on its 'd'. */
  puppies: readonly { path: readonly (readonly [number, number])[]; every: number }[]
}

export interface SpinnerText {
  kind: 'spin'
  reach: number
  arms: 1 | 2
  speed: number
  phase: number
}

export interface SliderText {
  kind: 'slide'
  dx: number
  dy: number
  half: number
  angle: number
  period: number
  phase: number
}

const GROUND: Record<string, Ground> = { '~': 'water', '.': 'grass', ',': 'path', '*': 'flowers', '=': 'bridge', '#': 'hedge', T: 'tree', r: 'rock' }
const GATE: Record<string, Hue> = { P: 'pink', G: 'green', B: 'blue' }
const BUTTON: Record<string, Hue> = { p: 'pink', g: 'green', b: 'blue' }
const THINGS = new Set(['S', '@', 'F', 'o', 'x', 'd', ...Object.keys(GATE), ...Object.keys(BUTTON), '1', '2', '3', '4', '5', '6', '7', '8', '9'])
/** Which ground a thing stands on when its neighbours tie. */
const UNDER_ORDER: readonly Ground[] = ['bridge', 'path', 'flowers', 'grass', 'water']

/** Parses a course's map and numbers, throwing with the course, row and column on anything wrong. */
export function parseCourse(text: CourseText): Course {
  const { id, map } = text
  const rows = map.length
  const cols = map[0]!.length
  const where = (c: number, r: number) => `${id} row ${r} column ${c}`
  map.forEach((row, r) => {
    if (row.length !== cols) throw new Error(`${id} row ${r} is ${row.length} wide, not ${cols}`)
    ;[...row].forEach((ch, c) => {
      if (!(ch in GROUND) && !THINGS.has(ch)) throw new Error(`${where(c, r)}: '${ch}' is not in the legend`)
    })
  })
  const at = (c: number, r: number) => (c < 0 || r < 0 || c >= cols || r >= rows ? '~' : map[r]![c]!)
  const ground: Ground[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = at(c, r)
      if (ch in GROUND) {
        ground.push(GROUND[ch]!)
        continue
      }
      // A thing: the ground most of its neighbours have.
      const votes = new Map<Ground, number>()
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const g = GROUND[at(c + dc, r + dr)]
        if (g && UNDER_ORDER.includes(g)) votes.set(g, (votes.get(g) ?? 0) + 1)
      }
      let best: Ground = 'grass'
      let most = 0
      for (const g of UNDER_ORDER) {
        const n = votes.get(g) ?? 0
        if (n > most) {
          best = g
          most = n
        }
      }
      ground.push(best)
    }
  }

  const spot = (c: number, r: number): Spot => ({ x: c + 0.5, y: r + 0.5 })
  let start: Spot | null = null
  let balloon: Spot | null = null
  const flags: Spot[] = []
  const foods: Spot[] = []
  const poops: Spot[] = []
  const buttons: { hue: Hue; x: number; y: number }[] = []
  const anchors = new Map<string, Spot>()
  const puppyStarts: Spot[] = []
  const gateTiles: { c: number; r: number; hue: Hue }[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = at(c, r)
      if (ch === 'S') {
        if (start) throw new Error(`${where(c, r)}: a second start`)
        start = spot(c, r)
      } else if (ch === '@') {
        if (balloon) throw new Error(`${where(c, r)}: a second balloon`)
        balloon = spot(c, r)
      } else if (ch === 'F') flags.push(spot(c, r))
      else if (ch === 'o') foods.push(spot(c, r))
      else if (ch === 'x') poops.push(spot(c, r))
      else if (ch === 'd') puppyStarts.push(spot(c, r))
      else if (ch in GATE) gateTiles.push({ c, r, hue: GATE[ch]! })
      else if (ch in BUTTON) buttons.push({ hue: BUTTON[ch]!, ...spot(c, r) })
      else if (/[1-9]/.test(ch)) {
        if (anchors.has(ch)) throw new Error(`${where(c, r)}: pole ${ch} is on the map twice`)
        anchors.set(ch, spot(c, r))
      }
    }
  }
  if (!start) throw new Error(`${id}: no start (S)`)
  if (!balloon) throw new Error(`${id}: no balloon (@)`)

  // Gates: straight runs of one hue, along a row or down a column.
  const gates: Gate[] = []
  const taken = new Set<string>()
  for (const t of gateTiles) {
    const key = `${t.c},${t.r}`
    if (taken.has(key)) continue
    const same = (c: number, r: number) => GATE[at(c, r)] === t.hue
    let along: 'row' | 'col'
    const tiles: { c: number; r: number }[] = []
    if (same(t.c + 1, t.r)) {
      along = 'row'
      for (let c = t.c; same(c, t.r); c++) tiles.push({ c, r: t.r })
    } else if (same(t.c, t.r + 1)) {
      along = 'col'
      for (let r = t.r; same(t.c, r); r++) tiles.push({ c: t.c, r })
    } else {
      // A lone tile lies along the wall it closes: walls left and right make it a row.
      const wall = (c: number, r: number) => {
        const g = GROUND[at(c, r)]
        return g === undefined || g === 'water' || g === 'hedge' || g === 'tree' || g === 'rock'
      }
      along = wall(t.c - 1, t.r) && wall(t.c + 1, t.r) ? 'row' : 'col'
      tiles.push({ c: t.c, r: t.r })
    }
    if (tiles.length > 3) throw new Error(`${where(t.c, t.r)}: a gate of ${tiles.length} tiles; at most 3`)
    for (const g of tiles) {
      const k = `${g.c},${g.r}`
      if (taken.has(k)) throw new Error(`${where(g.c, g.r)}: gate tiles touch both ways; make each gate a straight run`)
      taken.add(k)
    }
    gates.push({ hue: t.hue, tiles, along })
  }
  for (const hue of HUES) {
    const hasGate = gates.some((g) => g.hue === hue)
    const hasButton = buttons.some((b) => b.hue === hue)
    if (hasGate !== hasButton) throw new Error(`${id}: ${hasGate ? `a ${hue} gate but no ${hue} button` : `a ${hue} button but no ${hue} gate`}`)
  }

  const spinners: Spinner[] = []
  const sliders: Slider[] = []
  for (const [digit, p] of Object.entries(text.poles)) {
    const a = anchors.get(digit)
    if (!a) throw new Error(`${id}: pole ${digit} has numbers but is not on the map`)
    if (p.kind === 'spin') spinners.push({ x: a.x, y: a.y, reach: p.reach, arms: p.arms, speed: p.speed, phase: p.phase })
    else sliders.push({ ax: a.x - p.dx, ay: a.y - p.dy, bx: a.x + p.dx, by: a.y + p.dy, half: p.half, angle: p.angle, period: p.period, phase: p.phase })
  }
  for (const digit of anchors.keys()) if (!(digit in text.poles)) throw new Error(`${id}: pole ${digit} is on the map but has no numbers`)

  if (text.puppies.length !== puppyStarts.length) throw new Error(`${id}: ${puppyStarts.length} puppies on the map but ${text.puppies.length} paths`)
  const puppies: Puppy[] = text.puppies.map((p, i) => {
    const first = p.path[0]!
    const s = puppyStarts[i]!
    if (first[0] + 0.5 !== s.x || first[1] + 0.5 !== s.y) throw new Error(`${id}: puppy ${i + 1}'s path starts at ${first.join(',')}, not on its 'd' at ${s.x - 0.5},${s.y - 0.5}`)
    return { path: p.path.map(([c, r]) => spot(c, r)), every: p.every }
  })

  const openFor = { pink: text.openFor.pink ?? null, green: text.openFor.green ?? null, blue: text.openFor.blue ?? null }
  return { id, cols, rows, ground, start, balloon, flags, foods, poops, gates, buttons, openFor, spinners, sliders, puppies }
}
