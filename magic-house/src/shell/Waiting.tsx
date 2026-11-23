import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { inLang, type Lang } from '../../../profiles/src/lang'
import type { Sounds } from '../../../silly-billy/src/sounds'
import type { GiftEntry, LibrarySource } from '../protocol'
import type { QuizLevels, SeatedPlayer } from '../saves'
import type { SeatInput } from '../seats/input'
import type { SeatIndex } from '../seats/types'
import { NEW_DOOR, PAUSE, QUIZ } from '../words'
import { stickSteps, useSeatFrames, WaitBar } from './House'
import type { NewDoor } from './newDoor'
import { BUILT_IN_OBJECTS, giftObject, itemRecipe, presentRecipe } from './quiz/objects'
import { pictureOf } from './quiz/picture'
import { QuizColumn, type ColumnPad } from './quiz/QuizColumn'
import { objectKey, type QuizObject } from './quiz/reading'

/** The things a sum may count: Silly Billy's small round ones that read well side by side. */
const COUNTABLE_IDS = ['ball', 'beach-ball', 'rubber-duck', 'mushroom', 'pinecone', 'swim-ring', 'football']
const COUNTABLE: readonly QuizObject[] = COUNTABLE_IDS.map((id) => {
  const o = BUILT_IN_OBJECTS.find((b) => b.id === id)
  if (o === undefined) throw new Error(`Silly Billy has no built-in thing ${id} to count`)
  return o
})
/** How long any seat holds b to go back to the house, seconds: a press alone would send a whole party back on one child's slip. */
export const HOLD_SECS = 1
/** The longest the open room waits for a player to answer the question in hand, ms: a child who has walked off does not keep the others out. */
export const OPEN_WAIT_MS = 12_000

export interface WaitingProps {
  /** The page's language (the picked player's); each quiz column speaks its own player's (SeatedPlayer.lang). */
  lang: Lang
  /** The room being made, for the bar; null while it is asked for again after a drop (no bar). */
  door: Extract<NewDoor, { kind: 'waiting' }> | null
  /** The room is ready: call onOpen once the question in hand is answered (plan.md, A late room is waited for with quizzes). */
  ready: boolean
  /** The seated players in seat order, each with their own language and saves (their quiz levels). */
  players: readonly SeatedPlayer[]
  /** Every present the library has: objects for the reading questions, beside Silly Billy's built-in things. */
  gifts: readonly GiftEntry[]
  /** Where a present's file (its guarded model code) is read from. */
  source: LibrarySource
  input: SeatInput
  sounds: Sounds
  /** A player's quiz levels moved: the page writes them into that player's saves at once (saves.ts withQuiz). */
  onQuiz: (seat: SeatIndex, quiz: QuizLevels) => void
  /** Open the room now that it is ready. */
  onOpen: () => void
  /** Back to the house and its kept rooms. */
  onHouse: () => void
}

/**
 * The wait behind the new door (plan.md, A late room is waited for with quizzes): at the top the
 * bar fills against the time a room nearly always takes (none while the room is asked for again
 * after a drop); under it each player has a column of the screen, as in the dressing room, with
 * maths and reading questions at their own level and in their own language (shell/quiz/). Each
 * seat's stick and a answer in its own column, and a tap answers in any. The reading objects are
 * Silly Billy's built-in things at once and the presents as each is built.
 *
 * Once the room is kept (`ready`) the door says it is open, each column finishes the question in
 * hand, and the room opens when all are answered, or after OPEN_WAIT_MS. The house and its kept
 * rooms stay one tap away at the bottom, or HOLD_SECS of any seat's b, which fills the button as it is held.
 */
export function Waiting({ lang, door, ready, players, gifts, source, input, sounds, onQuiz, onOpen, onHouse }: WaitingProps) {
  // The presents built so far, as objects to read, and their models for the pictures.
  const [presents, setPresents] = useState<readonly { object: QuizObject; url: string }[]>([])
  useEffect(() => {
    let gone = false
    for (const g of gifts)
      void presentRecipe(source, g.id).then((recipe) => {
        if (gone || recipe === null) return
        const object = giftObject(g)
        const url = pictureOf(objectKey(object), recipe)
        setPresents((now) => (now.some((p) => p.object.id === g.id) ? now : [...now, { object, url }]))
      })
    return () => {
      gone = true
    }
  }, [gifts, source])
  const objects = useMemo(() => [...BUILT_IN_OBJECTS, ...presents.map((p) => p.object)], [presents])
  const picture = useCallback(
    (o: QuizObject) => {
      if (o.kind === 'item') return pictureOf(objectKey(o), itemRecipe(o.id))
      const present = presents.find((p) => p.object.id === o.id)
      if (present === undefined) throw new Error(`the present ${o.id} is read before it is built`)
      return present.url
    },
    [presents],
  )

  // The room opens once every column has answered its question in hand, or OPEN_WAIT_MS after it was ready.
  const open = useRef(onOpen)
  open.current = onOpen
  const done = useRef(new Set<number>())
  const opened = useRef(false)
  const openOnce = useCallback(() => {
    if (opened.current) return
    opened.current = true
    open.current()
  }, [])
  const columnDone = useCallback(
    (seat: number) => {
      done.current.add(seat)
      if (done.current.size === players.length) openOnce()
    },
    [players.length, openOnce],
  )
  useEffect(() => {
    if (!ready) return
    const late = setTimeout(openOnce, OPEN_WAIT_MS)
    return () => clearTimeout(late)
  }, [ready, openOnce])

  // Each seat's pad drives its own column; b held by any seat goes back to the house.
  const pads = useRef<(ColumnPad | null)[]>([])
  const across = useRef<boolean[]>([])
  const down = useRef<boolean[]>([])
  const held = useRef<number[]>([])
  const last = useRef(performance.now())
  const [hold, setHold] = useState(0)
  const seats = useMemo(() => players.map((p) => p.seat), [players])
  useSeatFrames(input, seats, (frame) => {
    const now = performance.now()
    const dt = (now - last.current) / 1000
    last.current = now
    // Across or up and down alike, so the stick walks the choices in a row or in a column.
    const ups = stickSteps(frame.pads, 1, down.current)
    stickSteps(frame.pads, 0, across.current).forEach((step, i) => {
      const by = step !== 0 ? step : ups[i]!
      if (by !== 0) pads.current[i]!.step(by)
    })
    frame.pads.forEach((pad, i) => {
      if (pad.a.pressed) pads.current[i]!.answer()
      held.current[i] = pad.b.held ? (held.current[i] ?? 0) + dt : 0
    })
    const most = Math.min(1, Math.max(0, ...held.current) / HOLD_SECS)
    if (most >= 1) {
      held.current = []
      onHouse()
    } else if (Math.abs(most - hold) > 0.04 || (most === 0 && hold !== 0)) setHold(most)
  })

  return (
    <main className="mh-page waiting quizzing">
      <div className="quiz-head">
        <div className="waiting-door small">
          <span className="sparkle" />
        </div>
        <div className="quiz-head-words">
          <h2>{inLang(ready ? QUIZ.doorOpen : NEW_DOOR.making, lang)}</h2>
          {!ready && door !== null && <WaitBar door={door} />}
        </div>
      </div>
      <div className="columns">
        {players.map((p) => (
          <QuizColumn key={p.seat.index} player={p} objects={objects} countable={COUNTABLE} picture={picture} closing={ready} sounds={sounds} pads={pads} onQuiz={(quiz) => onQuiz(p.seat.index, quiz)} onDone={() => columnDone(p.seat.index)} />
        ))}
      </div>
      <button className="big-button quiz-house" style={{ '--hold': hold } as CSSProperties} onClick={onHouse}>
        {inLang(PAUSE.toHouse, lang)}
      </button>
    </main>
  )
}
