/**
 * The library's developer sheet (magic-house/index.html?sheet=library), so the first rooms Opus
 * makes and their presents can be looked at. It reads the library where the page reads it (the dev
 * server's ./api/, or the files the build shipped):
 * - every kept room: its name in both languages, its theme and task, the party it was made for,
 *   what was rolled, the bots' seconds at each level, and a link that opens it on ?autoplay;
 * - with show=wear, every present worn by a kid in three pairs of colours, one row a pair, one
 *   column a present, its name and slot along the bottom; gifts=<a-b> shows only presents a to b.
 */

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { Lang } from '../../../profiles/src/lang'
import type { Recipe } from '../../../silly-billy/src/engine/types'
import type { Player, Solid, World } from '../engine/world'
import { WARDROBE } from '../own/wardrobe/wardrobe'
import type { GiftFile, LibraryIndex, LookReport, RoomEntry, RoomFile } from '../protocol'
import { fixture } from '../scene/fixtures'
import { RoomStage, type RoomSource, type ShownView } from '../scene/RoomStage'
import type { SeatIndex } from '../seats/types'
import { compileGift } from '../trial/compile'
import { tryLook } from '../trial/tryRoom'
import { giftRecipe } from '../trial/giftCheck'
import { houseLink } from './source'

/** The colour pairs each present is worn in, one row each: main and second. */
const PAIRS = [
  ['#e94b4b', '#ffd23a'],
  ['#3d8bff', '#ffffff'],
  ['#2fc46a', '#8a4bd6'],
] as const
/** The least room a column has across, metres; with few presents the columns widen to fill the screen. */
const GAP_LEAST = 1.4
const ROW_HEIGHT = 3
const BAND = 110

const SKINS = ['peach', 'caramel', 'milk', 'cocoa'] as const

/**
 * The small room made into a stand: a floor for each colour pair, a kid on it for each present,
 * wearing it in that pair. The camera shows exactly the columns across the stage's width, so the
 * names in the band below, one equal cell a present, stand under their kids.
 */
function stand(gifts: readonly GiftFile[], aspect: number): World {
  const w = fixture('small').world
  const kid = w.players[0]!
  const ground = w.solids[0]!
  const n = Math.max(gifts.length, 1)
  const high = PAIRS.length * ROW_HEIGHT + 0.4
  const gap = Math.max(GAP_LEAST, (high * aspect) / n)
  const width = n * gap
  w.solids = PAIRS.map((_, r): Solid => ({ ...ground, id: 1 + r, at: [width / 2, 1 + r * ROW_HEIGHT - 0.5, 0], shape: { kind: 'box', size: [width, 1, 2] } }))
  w.decor = []
  w.signs = []
  w.wayOut = { at: [-40, 1, 0], open: false }
  w.bounds = { min: [-1, 0, -4], max: [width + 1, high + 2, 4] }
  w.players = PAIRS.flatMap(([main, second], r) =>
    gifts.map((gift, i): Player => {
      const top = 1 + r * ROW_HEIGHT
      const at: [number, number, number] = [(i + 0.5) * gap, top, 0]
      const dressed = WARDROBE.dress({ backdrop: 'sky', skin: SKINS[(i + r) % SKINS.length]!, hair: 'short', hairColour: 'brown', eyes: 'dots', mouth: 'smile', extra: 'none' })
      return { ...kid, id: 100 + r * n + i, seat: ((r * n + i) % 4) as SeatIndex, at, start: at, jumpFrom: top, on: 1 + r, facing: 1, body: { ...kid.body, skin: dressed.skin }, wear: { ...dressed.wear, [gift.slot]: { id: gift.id, main, second, pattern: 'plain' } } }
    }),
  )
  w.camera = { x: width / 2, y: 0.4 + Math.max(high, width / aspect) / 2, width, height: width / aspect }
  return w
}

/** Keeps the stand's clock going, for the kids' idle and blink. */
function Clock({ world }: { world: World }) {
  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += Math.min(delta, 0.1)
    world.t = t.current
  }, -500)
  return null
}

/** Every present of the library on kids, in each colour pair. */
function Wear({ lang, index }: { lang: Lang; index: LibraryIndex }) {
  const [gifts, setGifts] = useState<GiftFile[] | null>(null)
  const range = new URLSearchParams(location.search).get('gifts')
  useEffect(() => {
    const [a, b] = range === null ? [0, index.gifts.length - 1] : range.split('-').map(Number)
    const { source } = houseLink()
    Promise.all(index.gifts.slice(a, b! + 1).map((g) => source.gift(g.id)))
      .then(setGifts)
      .catch((err: unknown) => console.error('the sheet could not read the presents:', err))
  }, [index, range])
  const models = useMemo(() => new Map<string, Recipe>((gifts ?? []).map((g) => [g.id, giftRecipe(compileGift(g.guarded), g.slot).recipe])), [gifts])
  const world = useMemo(() => (gifts === null ? null : stand(gifts, window.innerWidth / (window.innerHeight - BAND))), [gifts])
  const source = useMemo<RoomSource | null>(() => (world === null ? null : { world }), [world])
  const shown = useMemo<ShownView>(() => ({ view: null, high: null }), [])
  if (gifts === null || world === null || source === null) return <p style={{ padding: 16 }}>Reading the presents...</p>
  return (
    <>
      <RoomStage source={source} lang={lang} clearBottom={BAND} clearTop={0} worn={(id) => models.get(id) ?? WARDROBE.recipe(id)} shown={shown} house={false} look={null}>
        <Clock world={world} />
      </RoomStage>
      <div className="sheet-band" style={{ height: BAND }}>
        {gifts.map((g) => (
          <span key={g.id} title={g.form}>
            <b>{g.name.en}</b>
            <br />
            {g.name.fi}
            <br />
            <small>
              {g.slot} · {g.id}
            </small>
          </span>
        ))}
      </div>
    </>
  )
}

/** What a room's look is: its wish and the look check's counts and notes, read from the room's file and checked again in the worker as the page's own look check does; or that it has none. */
function LookCell({ id }: { id: string }) {
  const [shown, setShown] = useState<{ file: RoomFile; report: LookReport | null } | null>(null)
  useEffect(() => {
    let gone = false
    houseLink()
      .source.room(id)
      .then(async (file) => {
        if (gone) return
        setShown({ file, report: null })
        if (file.lookGuarded === null) return
        const report = await tryLook({ line: id, attempt: 1, check: 1, party: file.party, seed: file.seed, roll: file.roll, level: file.level, shell: file.shell, room: file.roomGuarded, look: file.lookGuarded })
        if (!gone) setShown({ file, report })
      })
      .catch((err: unknown) => console.error(`the sheet could not read the room ${id}:`, err))
    return () => {
      gone = true
    }
  }, [id])
  if (shown === null) return <small>reading...</small>
  const { file, report } = shown
  if (file.lookGuarded === null) return <small>no look</small>
  if (report === null) return <small>checking...</small>
  const c = report.counts
  return (
    <>
      {report.passed ? 'passes' : 'fails'}: {c.props} props ({c.answering} answer), {c.lights} lights, {c.lamps} lamps, {c.pieces} pieces, {c.leftOut} of {c.of} left out
      {report.sentences.map((t) => (
        <div key={t}>
          <small>{t}</small>
        </div>
      ))}
      {report.notes.map((t) => (
        <div key={t}>
          <small>note: {t}</small>
        </div>
      ))}
      {file.lookWish !== '' && (
        <div>
          <small>the look's wish: {file.lookWish}</small>
        </div>
      )}
    </>
  )
}

/** A room's shell as colour chips, walls, floor and ceiling, with the light. */
function ShellChips({ shell }: { shell: RoomEntry['shell'] }) {
  const chip = (what: string, color: string) => <span title={`${what} ${color}`} style={{ display: 'inline-block', width: 14, height: 14, marginRight: 3, background: color, border: '1px solid #888' }} />
  return (
    <>
      {chip('walls', shell.walls.color)}
      {chip('floor', shell.floor.color)}
      {chip('ceiling', shell.ceiling.color)}
      <small>light {shell.light}</small>
    </>
  )
}

/** Every kept room, newest first, with what the first rooms are looked at for. */
function Rooms({ index }: { index: LibraryIndex }) {
  return (
    <div className="sheet-list">
      <h1>Magic House library</h1>
      <p>
        {index.rooms.length} kept rooms, {index.gifts.length} presents. <a href="?sheet=library&show=wear">See the presents worn</a>
      </p>
      <table>
        <thead>
          <tr>
            <th>Room</th>
            <th>Theme, task and shell</th>
            <th>Party</th>
            <th>Rolled</th>
            <th>Bots, s</th>
            <th>Look</th>
            <th>Made</th>
          </tr>
        </thead>
        <tbody>
          {[...index.rooms].reverse().map((r) => (
            <tr key={r.id}>
              <td>
                <a href={`?room=${encodeURIComponent(r.id)}&autoplay&debug`}>{r.name.en}</a>
                <br />
                {r.name.fi}
                <br />
                <small>{r.id}</small>
              </td>
              <td>
                {r.theme}
                <br />
                <small>{r.task}</small>
                <br />
                <ShellChips shell={r.shell} />
              </td>
              <td>{r.party}</td>
              <td>
                {r.roll.kind}, {r.roll.view}
              </td>
              <td>
                {r.botSecs[1].toFixed(1)} / {r.botSecs[2].toFixed(1)} / {r.botSecs[3].toFixed(1)}
              </td>
              <td>
                <LookCell id={r.id} />
              </td>
              <td>
                <small>{r.made.slice(0, 16).replace('T', ' ')}</small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const STYLE = `
.sheet-list { position: fixed; inset: 0; overflow: auto; padding: 16px; background: #f4f1ea; color: #222; font-size: 15px; user-select: text; -webkit-user-select: text; }
.sheet-list h1 { margin: 0 0 8px; font-size: 24px; }
.sheet-list table { border-collapse: collapse; width: 100%; }
.sheet-list th, .sheet-list td { border-bottom: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
.sheet-list small { color: #666; }
.sheet-band { position: fixed; left: 0; right: 0; bottom: 0; display: flex; padding: 8px 0; box-sizing: border-box; background: #2b2b30; color: #eee; font-size: 13px; text-align: center; overflow: hidden; }
.sheet-band > span { flex: 1 1 0; min-width: 0; }
.sheet-band small { color: #aaa; }
`

export function Sheet({ lang }: { lang: Lang }) {
  const [index, setIndex] = useState<LibraryIndex | null>(null)
  useEffect(() => {
    houseLink()
      .source.index()
      .then(setIndex)
      .catch((err: unknown) => console.error('the sheet could not read the library:', err))
  }, [])
  const wear = new URLSearchParams(location.search).get('show') === 'wear'
  return (
    <>
      <style>{STYLE}</style>
      {index === null ? <p style={{ padding: 16 }}>Reading the library...</p> : wear ? <Wear lang={lang} index={index} /> : <Rooms index={index} />}
    </>
  )
}
