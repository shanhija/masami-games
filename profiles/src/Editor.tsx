import { useLayoutEffect, useState } from 'react'

import { PARTS, randomAvatar, type Avatar, type Part } from './avatar'
import { AvatarPicture } from './Avatar'
import { DIRECTORY } from './directory'
import { Flag } from './Flag'
import { inLang, LANG_NAMES, LANGS, type Lang, type Words } from './lang'
import { addProfile, clearGame, FIRST_LANG, NAME_MOST, removeProfile, savedGames, updateProfile, type Profile, type SavingGame } from './profiles'
import { CHOICE_NAMES, EDITOR, GALLERY, TAB_NAMES } from './words'

/** A game as its gallery card shows it: what the editor lists beside its Start over. */
export interface GalleryGame {
  folder: SavingGame
  /** The card's classes, which give it its colour. */
  className: string
  /** The card's picture, the gallery's own markup. */
  picture: string
}

/** The tabs of the avatar's parts, in the order the child meets them. */
const TAB_ICONS: Record<Part, string> = {
  skin: '🙂',
  hair: '💇',
  hairColour: '🖍️',
  eyes: '👀',
  mouth: '👄',
  extra: '👑',
  backdrop: '🎨',
}
const TAB_ORDER = Object.keys(TAB_ICONS) as Part[]

/**
 * Making a new player (`profile` null: a surprise avatar to start from, in FIRST_LANG) or
 * changing one: the avatar part by part, each choice drawn on the avatar itself, a surprise,
 * the name, the language by its flag; for a player already made, the games they have saved in,
 * each with Start over, and Remove player. Start over and Remove ask "Really?" first and happen
 * at the second tap; the avatar, the name and the language are kept at Done, and Back leaves
 * them as they were. The editor speaks the language its flag is at, so a tap on a flag shows
 * at once what the games will.
 */
export function Editor({ profile, games, onDone, onBack }: { profile: Profile | null; games: GalleryGame[]; onDone: (profile: Profile) => void; onBack: () => void }) {
  const [avatar, setAvatar] = useState<Avatar>(() => (profile === null ? randomAvatar(Math.random) : profile.avatar))
  const [name, setName] = useState(profile === null ? '' : profile.name)
  const [lang, setLang] = useState<Lang>(profile === null ? FIRST_LANG : profile.lang)
  const [tab, setTab] = useState<Part>('skin')
  /** What waits for its second tap: a game to start over, or removing the player. */
  const [armed, setArmed] = useState<SavingGame | 'remove' | null>(null)
  const [saved, setSaved] = useState<SavingGame[]>(() => (profile === null ? [] : savedGames(profile.id)))
  const trimmed = name.trim()
  const say = (words: Words) => inLang(words, lang)

  useLayoutEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const done = () => {
    if (trimmed === '') return
    if (profile === null) return onDone(addProfile(trimmed, avatar, lang))
    const changed = { ...profile, name: trimmed, avatar, lang }
    updateProfile(changed)
    onDone(changed)
  }

  return (
    <div className="profiles-screen editor">
      <h1>{profile === null ? say(GALLERY.newPlayer) : trimmed === '' ? say(EDITOR.yourPlayer) : trimmed}</h1>
      <div className="editor-top">
        <div className="editor-face">
          <AvatarPicture avatar={avatar} className="avatar huge" />
          <button type="button" className="pill surprise" onClick={() => setAvatar(randomAvatar(Math.random))}>
            {say(EDITOR.surprise)}
          </button>
          <label className="name-field">
            <span>{say(EDITOR.name)}</span>
            <input value={name} maxLength={NAME_MOST} placeholder={say(EDITOR.typeName)} autoComplete="off" spellCheck={false} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && done()} />
          </label>
          <div className="langs" role="radiogroup" aria-label={say(EDITOR.language)}>
            {LANGS.map((l) => (
              <button key={l} type="button" role="radio" aria-checked={lang === l} className={lang === l ? 'lang on' : 'lang'} onClick={() => setLang(l)}>
                <Flag lang={l} className="flag" />
                <span lang={l}>{LANG_NAMES[l]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="editor-parts">
          <div className="tabs" role="tablist">
            {TAB_ORDER.map((part) => (
              <button key={part} type="button" role="tab" aria-selected={tab === part} className={tab === part ? 'tab on' : 'tab'} onClick={() => setTab(part)}>
                <span className="tab-icon" aria-hidden="true">
                  {TAB_ICONS[part]}
                </span>
                {say(TAB_NAMES[part])}
              </button>
            ))}
          </div>
          <div className="choices">
            {PARTS[tab].map((choice) => {
              const names: Readonly<Record<string, Words>> = CHOICE_NAMES[tab]
              const tried = { ...avatar, [tab]: choice } as Avatar
              return (
                <button key={choice} type="button" className={avatar[tab] === choice ? 'choice on' : 'choice'} aria-label={say(names[choice]!)} onClick={() => setAvatar(tried)}>
                  <AvatarPicture avatar={tried} className="avatar" />
                </button>
              )
            })}
          </div>
        </div>
      </div>
      {profile !== null && (
        <section className="saved">
          <h2>{say(EDITOR.savedGames)}</h2>
          {saved.length === 0 && <p className="nothing">{say(EDITOR.nothingSaved)}</p>}
          {games
            .filter((g) => saved.includes(g.folder))
            .map((g) => (
              <div key={g.folder} className="saved-game">
                <span className={`${g.className} mini`}>
                  <span className="picture" aria-hidden="true" dangerouslySetInnerHTML={{ __html: g.picture }} />
                </span>
                <span className="saved-name">{say(DIRECTORY[g.folder].name)}</span>
                <button
                  type="button"
                  className={armed === g.folder ? 'pill danger armed' : 'pill danger'}
                  onClick={() => {
                    if (armed !== g.folder) return setArmed(g.folder)
                    clearGame(profile.id, g.folder)
                    setSaved(savedGames(profile.id))
                    setArmed(null)
                  }}
                >
                  {armed === g.folder ? say(EDITOR.reallyStartOver) : say(EDITOR.startOver)}
                </button>
              </div>
            ))}
        </section>
      )}
      <div className="editor-buttons">
        <button type="button" className="pill back" onClick={onBack}>
          {say(EDITOR.back)}
        </button>
        <button type="button" className="pill done" disabled={trimmed === ''} onClick={done}>
          {say(EDITOR.done)}
        </button>
      </div>
      {profile !== null && (
        <button
          type="button"
          className={armed === 'remove' ? 'pill danger remove armed' : 'pill danger remove'}
          onClick={() => {
            if (armed !== 'remove') return setArmed('remove')
            removeProfile(profile.id)
            onBack()
          }}
        >
          {armed === 'remove' ? say(EDITOR.reallyRemove(profile.name)) : say(EDITOR.removePlayer)}
        </button>
      )}
    </div>
  )
}
