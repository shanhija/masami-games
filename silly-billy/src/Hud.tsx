import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode, type SyntheticEvent } from 'react'

import type { HeardBy, HeardLine, Job } from './brain/contract'
import { inLang, LANGS, type Lang, type Words } from './engine/lang'
import { ROOMS, type Worn } from './engine/types'
import { toggleFullscreen, useGameView, type Game } from './game'
import { BinIcon, CogIcon, FullIcon, GamesIcon, KeyboardIcon, MicIcon, PauseIcon, Portrait, RoomIcon, SendIcon, SoundIcon, VoiceIcon, ZoomIcon } from './Icons'
import type { Listener } from './voice/mic'

/** "Forget the newest thing" and "Forget everything" want a second tap within this long, ms: the world stands still while the card is up. */
const ARM_FOR = 3000

/** Every word the HUD shows, in both languages: the setting picks one when it is shown. */
const SAY = {
  hold: { en: 'Hold and talk!', fi: 'Pidä pohjassa ja puhu!' },
  holdLabel: { en: 'hold to talk', fi: 'pidä pohjassa ja puhu' },
  type: { en: 'Type what to do', fi: 'Kirjoita, mitä tehdään' },
  send: { en: 'send', fi: 'lähetä' },
  closer: { en: 'closer', fi: 'lähemmäs' },
  farther: { en: 'farther', fi: 'kauemmas' },
  noMic: { en: 'No microphone', fi: 'Ei mikrofonia' },
  oops: { en: 'oops', fi: 'hups' },
  pause: { en: 'pause', fi: 'tauko' },
  paused: { en: 'Paused', fi: 'Tauko' },
  keepGoing: { en: 'Keep going', fi: 'Jatka' },
  sound: { en: 'sound', fi: 'äänet' },
  soundOn: { en: 'Sound on', fi: 'Äänet päällä' },
  soundOff: { en: 'Sound off', fi: 'Äänet pois' },
  voices: { en: 'voices', fi: 'puhe' },
  voicesOn: { en: 'Voices on', fi: 'Puhe päällä' },
  voicesOff: { en: 'Voices off', fi: 'Puhe pois' },
  forget: { en: 'Forget the newest thing', fi: 'Unohda uusin juttu' },
  reallyForget: { en: 'Really forget it?', fi: 'Unohdetaanko varmasti?' },
  forgetAll: { en: 'Forget everything made', fi: 'Unohda kaikki tehty' },
  reallyForgetAll: { en: 'Really forget everything?', fi: 'Unohdetaanko kaikki?' },
  fullScreen: { en: 'Full screen', fi: 'Koko näyttö' },
  moreGames: { en: 'More games', fi: 'Lisää pelejä' },
  blocked: { en: ' The microphone is blocked: let this page use it, or type.', fi: ' Mikrofoni on estetty: anna tämän sivun käyttää sitä, tai kirjoita.' },
  waking: { en: ' Whisper is waking up.', fi: ' Whisper on heräämässä.' },
  noInventing: { en: 'No inventing here: only the things already made.', fi: 'Täällä ei keksitä uutta: vain jo tehdyt asiat.' },
} satisfies Record<string, Words>

/** The language's own name on its button: the same in both, so a child or parent who cannot read the other one still finds theirs. */
const LANG_NAMES: Record<Lang, string> = { fi: 'Suomi', en: 'English' }

/** How a command was understood, in a word for the parent: the interpreter's time is how long understanding took. */
const HOW: Record<HeardBy, Words> = {
  phrase: { en: 'phrase', fi: 'muistista' },
  local: { en: 'quick', fi: 'heti' },
  interpreter: { en: 'understood', fi: 'ymmärretty' },
  offline: { en: 'guess', fi: 'arvaus' },
}

/** What an invention is doing, in words for the parent. */
function stageWords(j: Job): Words {
  switch (j.stage) {
    case 'drafting':
    case 'designing':
      return j.kind === 'action' ? { en: 'Thinking this through', fi: 'Mietitään' } : { en: 'Drawing', fi: 'Piirretään' }
    case 'testing':
      return { en: 'Trying it out', fi: 'Kokeillaan' }
    case 'fixing':
      return { en: 'Trying again', fi: 'Yritetään uudestaan' }
  }
}

/** For the parent: where the child's voice goes. */
const VOICE: Record<Listener, Words> = {
  whisper: { en: 'Your voice goes to Whisper on this computer.', fi: 'Whisper kuuntelee äänesi tällä tietokoneella.' },
  browser: { en: "Your voice goes to the browser's own recognizer.", fi: 'Selaimen oma puheentunnistus kuuntelee äänesi.' },
  none: { en: 'Nothing listens here. Type what to do instead.', fi: 'Täällä mikään ei kuuntele. Kirjoita, mitä tehdään.' },
}

/** For the parent: who invents, with the models' names. */
const inventing = (interpret: string, invent: string): Words => ({
  en: `New things are invented by Claude on this computer (${interpret} and ${invent}).`,
  fi: `Claude keksii uudet asiat tällä tietokoneella (${interpret} ja ${invent}).`,
})

/** Seconds with one decimal the way the language writes them: 3.2 s, 3,2 s. */
const seconds = (s: number, lang: Lang) => `${lang === 'fi' ? s.toFixed(1).replace('.', ',') : s.toFixed(1)} s`

const noMenu = (e: SyntheticEvent) => e.preventDefault()

/** The colour a list of colours shows most, for a worn thing without a tint. */
function mostUsed(colors: string[]): string {
  const count = new Map<string, number>()
  for (const c of colors) count.set(c, (count.get(c) ?? 0) + 1)
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '#9aa3ad'
}

/** Every button in the HUD: a long press never opens the browser's menu. */
function Btn({ className, label, onTap, onDown, children }: { className: string; label: string; onTap?: () => void; onDown?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      onClick={onTap}
      onPointerDown={
        onDown &&
        ((e) => {
          e.preventDefault()
          onDown()
        })
      }
      onContextMenu={noMenu}
    >
      {children}
    </button>
  )
}

/**
 * The words and pictures over the rooms, few and big: the cast's faces along the top with the
 * room pictures on the right and a small box to type a command under them, the last command
 * under the faces and the things being invented under that, the big hold-to-talk button at the
 * bottom middle with the words in a bubble over it, and in the corner the + and − of the zoom
 * over the pause button. Paused, only the pause card shows, over a dimmed picture that takes
 * every tap. Every word is in the language the game is played in. Re-renders only when the game
 * says there is news.
 */
export function Hud({ game }: { game: Game }) {
  useGameView(game)
  const w = game.world
  const brain = game.brain
  const lang = game.settings.lang
  const say = (words: Words) => inLang(words, lang)
  // The page's language too, for the browser's own reading aloud and spelling.
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  const line = brain.lines.at(-1)
  const paint = (worn: Worn) => worn.tint ?? mostUsed(game.info(worn.kind).recipe.shapes.map((s) => s.color))
  const held = game.mic.held
  const blocked = game.mic.blocked
  // Nothing can listen here: no big button, and the box to type in asks for words.
  const typeOnly = game.listener === 'none'
  // Before the first command the bubble says what the button is for.
  const hint = !typeOnly && !held && brain.lines.length === 0
  const bubble = game.missed ? (blocked ? say(SAY.noMic) : '?') : game.words !== '' ? game.words : held ? '...' : hint ? say(SAY.hold) : null
  const zoom = game.view.goal
  const cast = useRef<HTMLDivElement>(null)
  // More faces than fit: the row fades out at its end, so it shows it can be swiped.
  useLayoutEffect(() => {
    const el = cast.current
    if (el === null) return
    const more = () => void el.classList.toggle('more', el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
    more()
    el.addEventListener('scroll', more, { passive: true })
    window.addEventListener('resize', more)
    return () => {
      el.removeEventListener('scroll', more)
      window.removeEventListener('resize', more)
    }
  })
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    game.talk(true)
  }
  const up = () => game.talk(false)

  if (game.paused)
    return (
      <div className="hud paused">
        <PauseCard game={game} />
      </div>
    )
  return (
    <div className="hud">
      <div className="top">
        <div className="cast" ref={cast}>
          {w.actors.map((a) => (
            <Btn key={a.id} className={`portrait${brain.addressee === a.id ? ' addressee' : ''}`} label={a.name} onDown={() => game.address(a.id)}>
              <Portrait actor={a} size={54} paint={paint} />
              <span className="name">{a.name}</span>
              {a.thinking !== null ? (
                <span className="badge">
                  <CogIcon size={26} />
                </span>
              ) : (
                a.listening && <span className="badge dots">...</span>
              )}
            </Btn>
          ))}
        </div>
        <div className="side">
          <div className="rooms">
            {ROOMS.map((r) => (
              <Btn key={r} className={`room${w.room === r ? ' here' : ''}`} label={r} onDown={() => game.goTo(r)}>
                <RoomIcon room={r} size={50} />
              </Btn>
            ))}
          </div>
          <TypeBox game={game} ask={typeOnly || blocked} />
        </div>
      </div>

      <div className="news">
        {line !== undefined && <Heard line={line} lang={lang} />}
        {brain.jobs.map((j) => (
          <div key={`${j.kind}:${j.id}`} className="job">
            <span className="fill" style={{ width: `${Math.round(j.progress * 100)}%` }} />
            <CogIcon size={30} />
            <span className="what">
              {say(stageWords(j))}: <span className="name">{say({ en: j.name, fi: j.nameFi })}</span>
            </span>
            <span className="secs">{game.jobSecs(j)} s</span>
          </div>
        ))}
      </div>

      <div className="talk">
        {bubble !== null && <div className={`bubble${game.missed && !blocked ? ' missed' : hint && game.words === '' ? ' hint' : ''}`}>{bubble}</div>}
        {!typeOnly && (
          <button type="button" className={`mic${held ? ' on' : ''}`} aria-label={say(SAY.holdLabel)} onPointerDown={down} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onContextMenu={noMenu}>
            <MicIcon size={86} off={blocked} />
          </button>
        )}
      </div>

      <div className="corner">
        <Btn className={`round zoom${zoom >= 1 ? ' end' : ''}`} label={say(SAY.closer)} onDown={() => game.view.step(1, w.actors)}>
          <ZoomIcon size={44} closer />
        </Btn>
        <Btn className={`round zoom${zoom <= 0 ? ' end' : ''}`} label={say(SAY.farther)} onDown={() => game.view.step(-1, w.actors)}>
          <ZoomIcon size={44} closer={false} />
        </Btn>
        <Btn className="round" label={say(SAY.pause)} onTap={() => game.pause()}>
          <PauseIcon size={34} />
        </Btn>
      </div>
    </div>
  )
}

/** The last command: the words as heard, small, then what was understood and how, in `lang`. */
function Heard({ line, lang }: { line: HeardLine; lang: Lang }) {
  const busy = line.status === 'understanding' || line.status === 'making'
  const heard = inLang(line.heard, lang)
  return (
    <div className="line">
      <p className="said">“{line.words}”</p>
      <p className="understood">
        {busy && <CogIcon size={30} />}
        <span>{heard === '' ? '...' : heard}</span>
        {line.by !== null && (
          <span className="how">
            {inLang(HOW[line.by], lang)}
            {line.took !== null && ` ${seconds(line.took, lang)}`}
          </span>
        )}
        {line.status === 'failed' && <span className="how oops">{inLang(SAY.oops, lang)}</span>}
      </p>
    </div>
  )
}

/**
 * For the parent: a small box to type a command in, always there under the room buttons, out of
 * the way of the big button. Enter (or the arrow) sends it and empties it. On a touch screen
 * sending puts the keyboard away, so the child sees what happens, and so does a tap anywhere
 * else. It glows when typing is the only way (`ask`: nothing listens, or the microphone is
 * blocked). The keys typed in it are its own (`keyAction`): Space is no talk key here.
 */
function TypeBox({ game, ask }: { game: Game; ask: boolean }) {
  const [text, setText] = useState('')
  const form = useRef<HTMLFormElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const say = (words: Words) => inLang(words, game.settings.lang)
  useEffect(() => {
    const away = (e: globalThis.PointerEvent) => {
      if (document.activeElement === input.current && !form.current!.contains(e.target as Node)) input.current!.blur()
    }
    window.addEventListener('pointerdown', away)
    return () => window.removeEventListener('pointerdown', away)
  }, [])
  const empty = text.trim() === ''
  return (
    <form
      ref={form}
      className={`typebox${ask ? ' ask' : ''}`}
      onSubmit={(e) => {
        e.preventDefault()
        if (empty) return
        game.type(text)
        setText('')
        if (matchMedia('(hover: none)').matches) input.current!.blur()
      }}
    >
      <label>
        <KeyboardIcon size={30} />
        <input
          ref={input}
          type="text"
          value={text}
          placeholder={say(SAY.type)}
          aria-label={say(SAY.type)}
          enterKeyHint="send"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <button type="submit" className={`send${empty ? ' empty' : ''}`} aria-label={say(SAY.send)} onContextMenu={noMenu}>
        <SendIcon size={26} />
      </button>
    </form>
  )
}

/** Paused: keep going, the settings, forgetting the newest or everything, more games, and two plain lines for the parent. Closing it forgets a first tap on either. */
function PauseCard({ game }: { game: Game }) {
  const [armed, setArmed] = useState<'newest' | 'all' | null>(null)
  useEffect(() => {
    if (armed === null) return
    const id = setTimeout(() => setArmed(null), ARM_FOR)
    return () => clearTimeout(id)
  }, [armed])
  const s = game.settings
  const say = (words: Words) => inLang(words, s.lang)
  const status = game.status
  const voice = say(VOICE[game.listener]) + (game.mic.blocked ? say(SAY.blocked) : '') + (status !== null && status.whisper === 'starting' ? say(SAY.waking) : '')
  const invent = say(status !== null && status.claude ? inventing(status.models.interpret, status.models.invent) : SAY.noInventing)
  return (
    <div className="card menu">
      <h1>{say(SAY.paused)}</h1>
      <Btn className="big" label={say(SAY.keepGoing)} onTap={() => game.resume()}>
        {say(SAY.keepGoing)}
      </Btn>
      <div className="row">
        <Btn className="" label={say(SAY.sound)} onTap={() => game.setSettings({ sound: !s.sound })}>
          <SoundIcon size={30} on={s.sound} />
          {say(s.sound ? SAY.soundOn : SAY.soundOff)}
        </Btn>
        <Btn className="" label={say(SAY.voices)} onTap={() => game.setSettings({ spoken: !s.spoken })}>
          <VoiceIcon size={30} on={s.spoken} />
          {say(s.spoken ? SAY.voicesOn : SAY.voicesOff)}
        </Btn>
        <span className="pair">
          {LANGS.map((l) => (
            <Btn key={l} className={s.lang === l ? 'on' : ''} label={LANG_NAMES[l]} onTap={() => game.setSettings({ lang: l })}>
              {LANG_NAMES[l]}
            </Btn>
          ))}
        </span>
      </div>
      <div className="row">
        {/* Without the dev server nothing can be forgotten for good: it would come back on the next visit. */}
        {status !== null && (
          <Btn
            className={armed === 'newest' ? 'armed' : ''}
            label={say(SAY.forget)}
            onTap={() => {
              if (armed !== 'newest') return setArmed('newest')
              setArmed(null)
              void game.forgetNewest()
            }}
          >
            <BinIcon size={30} />
            {say(armed === 'newest' ? SAY.reallyForget : SAY.forget)}
          </Btn>
        )}
        {status !== null && (
          <Btn
            className={armed === 'all' ? 'armed' : ''}
            label={say(SAY.forgetAll)}
            onTap={() => {
              if (armed !== 'all') return setArmed('all')
              setArmed(null)
              void game.forgetAll()
            }}
          >
            <BinIcon size={30} />
            {say(armed === 'all' ? SAY.reallyForgetAll : SAY.forgetAll)}
          </Btn>
        )}
        <Btn className="" label={say(SAY.fullScreen)} onTap={toggleFullscreen}>
          <FullIcon size={30} />
          {say(SAY.fullScreen)}
        </Btn>
        <Btn className="" label={say(SAY.moreGames)} onTap={() => location.assign('../index.html')}>
          <GamesIcon size={30} />
          {say(SAY.moreGames)}
        </Btn>
      </div>
      {game.forgot !== null && <p className="small">{say(game.forgot)}</p>}
      <div className="parent">
        <p>{voice}</p>
        <p>{invent}</p>
      </div>
    </div>
  )
}
