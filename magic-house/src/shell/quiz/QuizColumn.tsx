import './Quiz.css'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

import { AvatarPicture } from '../../../../profiles/src/Avatar'
import { inLang, type Lang } from '../../../../profiles/src/lang'
import type { Sounds } from '../../../../silly-billy/src/sounds'
import type { QuizLevels, SeatedPlayer } from '../../saves'
import { QUIZ } from '../../words'
import { DEBUG } from '../RoomScreen'
import { pick } from './chance'
import { afterAnswer, FRESH_ROWS, type Rows, type Subject } from './levels'
import { mathsQuestion, type MathsQuestion } from './maths'
import { objectKey, readingQuestion, wordOf, type QuizObject, type ReadingQuestion } from './reading'

/** How long a right answer's star shows before the next question, and a wrong answer's right one, ms. */
export const SHOW_MS = { right: 1300, wrong: 2600 } as const
/** How many of a player's last reading targets are not asked again soon. */
const RECENT = 8

/** A question in hand: a sum with the thing it counts in, or a word to match. */
type Asked = { readonly subject: 'maths'; readonly q: MathsQuestion; readonly thing: QuizObject } | { readonly subject: 'reading'; readonly q: ReadingQuestion }

/** What the page drives a column with from its seat's pad: the stick steps the ring along the choices, a answers the ringed one. */
export interface ColumnPad {
  step: (by: -1 | 1) => void
  answer: () => void
}

export interface QuizColumnProps {
  player: SeatedPlayer
  /** Every object to read, Silly Billy's and the presents built so far. */
  objects: readonly QuizObject[]
  /** The things a sum may count. */
  countable: readonly QuizObject[]
  /** An object's picture, as an image URL. */
  picture: (o: QuizObject) => string
  /** The room is ready: after the question in hand no new one comes, and onDone says so. */
  closing: boolean
  sounds: Sounds
  /** Where the column hands the page its pad, by its seat. */
  pads: { current: (ColumnPad | null)[] }
  onQuiz: (quiz: QuizLevels) => void
  onDone: () => void
}

/**
 * One player's column of the quiz (plan.md, A late room is waited for with quizzes): their face and
 * stars at the top, then a question in their own language at their own level, maths and reading
 * by turns, the first by their seat so neighbours start apart. Three choices, answered by a tap or
 * by their seat (the stick rings one, a answers it; a touch seat taps, so no ring). A right answer
 * is a star, with a sound and a puff of little stars; a wrong one fades and the right one glows,
 * and nothing is lost. The levels move by levels.ts and go to the page at once. Once `closing`, the
 * question in hand is the last: when it is answered the column says the door is open.
 */
export function QuizColumn({ player, objects, countable, picture, closing, sounds, pads, onQuiz, onDone }: QuizColumnProps) {
  const lang = player.lang
  const seat = player.seat.index
  const levels = useRef<QuizLevels>(player.saves.quiz)
  const rows = useRef<Rows>(FRESH_ROWS)
  const recent = useRef<string[]>([])
  const nextSubject = useRef<Subject>(seat % 2 === 0 ? 'maths' : 'reading')

  const make = (): Asked => {
    const subject = nextSubject.current
    nextSubject.current = subject === 'maths' ? 'reading' : 'maths'
    if (subject === 'maths') return { subject, q: mathsQuestion(levels.current.maths, Math.random), thing: pick(countable, Math.random) }
    const q = readingQuestion(levels.current.reading, lang, objects, new Set(recent.current), Math.random)
    recent.current = [objectKey(q.target), ...recent.current].slice(0, RECENT)
    return { subject, q }
  }

  const [asked, setAsked] = useState<Asked | null>(make)
  const [ring, setRing] = useState(1)
  const [picked, setPicked] = useState<number | null>(null)
  const [stars, setStars] = useState(0)
  const timer = useRef(0)
  useEffect(() => () => clearTimeout(timer.current), [])
  // The timer's end reads the latest: whether the room is ready by then.
  const closingNow = useRef(closing)
  closingNow.current = closing

  const rightAt = (a: Asked) => (a.subject === 'maths' ? a.q.choices.indexOf(a.q.answer) : a.q.choices.indexOf(a.q.target))

  // Set at once on an answer, so a tap and a key in one frame answer once.
  const answered = useRef(false)
  const choose = (i: number) => {
    if (asked === null || answered.current) return
    answered.current = true
    const right = i === rightAt(asked)
    setPicked(i)
    setRing(i)
    if (right) setStars((n) => n + 1)
    sounds.play(right ? 'ding' : 'boing')
    const moved = afterAnswer(levels.current, rows.current, asked.subject, right)
    rows.current = moved.rows
    if (moved.levels !== levels.current) {
      levels.current = moved.levels
      onQuiz(moved.levels)
    }
    timer.current = window.setTimeout(
      () => {
        answered.current = false
        setPicked(null)
        setRing(1)
        if (closingNow.current) {
          setAsked(null)
          onDone()
        } else setAsked(make())
      },
      right ? SHOW_MS.right : SHOW_MS.wrong,
    )
  }

  pads.current[seat] = {
    step: (by) => {
      if (picked === null) setRing((r) => Math.max(0, Math.min(2, r + by)))
    },
    answer: () => choose(ring),
  }

  const ringShown = player.seat.device.kind !== 'touch'
  return (
    <section className="column quiz-column" style={{ '--seat': player.seat.color } as CSSProperties}>
      <div className="quiz-top">
        <span className="column-face">{player.face === null ? <span className="no-face" /> : <AvatarPicture avatar={player.face} className="avatar" />}</span>
        <span className="quiz-stars" role="img" aria-label={`${inLang(QUIZ.stars, lang)} ${stars}`}>
          <span className="star" />
          {stars}
        </span>
      </div>
      {asked === null ? <p className="quiz-open">{inLang(QUIZ.doorOpen, lang)}</p> : <Question asked={asked} lang={lang} picture={picture} ring={ringShown && picked === null ? ring : null} picked={picked} right={rightAt(asked)} onChoose={choose} />}
    </section>
  )
}

/** The question in hand and its three choices: numbers for a sum and pictures for a word shown, in a row; words for a picture shown, one under another, so a long word keeps whole. After an answer the right one glows (with a star puff when it was picked) and the others fade. Under ?debug on the dev server the right one is marked (data-right) for headless checks. */
function Question({ asked, lang, picture, ring, picked, right, onChoose }: { asked: Asked; lang: Lang; picture: (o: QuizObject) => string; ring: number | null; picked: number | null; right: number; onChoose: (i: number) => void }) {
  const faces: ReactNode[] =
    asked.subject === 'maths'
      ? asked.q.choices.map((n) => <span className="quiz-number">{n}</span>)
      : asked.q.choices.map((o) => (asked.q.shown === 'word' ? <img className="quiz-object" src={picture(o)} alt="" /> : <Word className="quiz-choice-word" text={wordOf(o, lang)} />))
  return (
    <>
      <div className="quiz-ask">{asked.subject === 'maths' ? <SumShown q={asked.q} thing={picture(asked.thing)} lang={lang} /> : asked.q.shown === 'word' ? <Word className="quiz-word" text={wordOf(asked.q.target, lang)} /> : <img className="quiz-object big" src={picture(asked.q.target)} alt="" />}</div>
      <div className={`quiz-choices${asked.subject === 'reading' && asked.q.shown === 'object' ? ' words' : ''}`}>
        {faces.map((face, i) => {
          const state = picked === null ? '' : i === right ? ' right' : i === picked ? ' missed' : ' faded'
          return (
            <button key={i} className={`quiz-choice${i === ring ? ' ringed' : ''}${state}`} data-right={DEBUG && i === right ? '' : undefined} onClick={() => onChoose(i)}>
              {face}
              {picked === i && i === right && (
                <>
                  <Puff />
                  <span className="quiz-yes">{inLang(QUIZ.yes, lang)}</span>
                </>
              )}
            </button>
          )
        })}
      </div>
    </>
  )
}

/** A word to read, its letters counted for the stylesheet, which makes a long word smaller so it fits its column whole. */
function Word({ className, text }: { className: string; text: string }) {
  return (
    <span className={className} style={{ '--letters': Math.max(4, text.length) } as CSSProperties}>
      {text}
    </span>
  )
}

/** A sum as it is shown: things to count with the question under them; two heaps of things with the sum written under them; or the sum in numbers alone. */
function SumShown({ q, thing, lang }: { q: MathsQuestion; thing: string; lang: Lang }) {
  const things = (n: number, gone: number) => (
    <span className="quiz-things">
      {Array.from({ length: n }, (_, i) => (
        <img key={i} src={thing} alt="" className={i >= n - gone ? 'gone' : undefined} />
      ))}
    </span>
  )
  const s = q.sum
  if (s.kind === 'count')
    return (
      <>
        {things(s.n, 0)}
        <span className="quiz-say">{inLang(QUIZ.howMany, lang)}</span>
      </>
    )
  const written = <span className="quiz-sum">{`${s.a} ${s.kind === 'add' ? '+' : '−'} ${s.b} = ?`}</span>
  if (!s.things) return written
  return (
    <>
      {s.kind === 'add' ? (
        <span className="quiz-heaps">
          {things(s.a, 0)}
          <span className="quiz-plus">+</span>
          {things(s.b, 0)}
        </span>
      ) : (
        things(s.a, s.b)
      )}
      {written}
    </>
  )
}

/** A puff of little stars out of a right answer, drawn by the stylesheet once and gone. */
function Puff() {
  return (
    <span className="quiz-puff" aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <span key={i} className="star" style={{ '--turn': `${i * 45}deg` } as CSSProperties} />
      ))}
    </span>
  )
}
