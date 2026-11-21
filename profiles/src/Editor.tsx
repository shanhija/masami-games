import { useState } from 'react'

import { PARTS, randomAvatar, type Avatar, type Part } from './avatar'
import { AvatarPicture } from './Avatar'
import { addProfile, clearGame, NAME_MOST, removeProfile, savedGames, updateProfile, type Profile, type SavingGame } from './profiles'

/** A game as its gallery card shows it: what the editor lists beside its Start over. */
export interface GalleryGame {
  folder: SavingGame
  name: string
  /** The card's classes, which give it its colour. */
  className: string
  /** The card's picture, the gallery's own markup. */
  picture: string
}

/** The tabs of the avatar's parts, in the order the child meets them. */
const TABS: Record<Part, { icon: string; label: string }> = {
  skin: { icon: '🙂', label: 'Face' },
  hair: { icon: '💇', label: 'Hair' },
  hairColour: { icon: '🖍️', label: 'Hair colour' },
  eyes: { icon: '👀', label: 'Eyes' },
  mouth: { icon: '👄', label: 'Mouth' },
  extra: { icon: '👑', label: 'Fun' },
  backdrop: { icon: '🎨', label: 'Colour' },
}
const TAB_ORDER = Object.keys(TABS) as Part[]

/**
 * Making a new player (`profile` null: a surprise avatar to start from) or changing one: the
 * avatar part by part, each choice drawn on the avatar itself, a surprise, the name; for a
 * player already made, the games they have saved in, each with Start over, and Remove player.
 * Start over and Remove ask "Really?" first and happen at the second tap; the avatar and the
 * name are kept at Done, and Back leaves them as they were.
 */
export function Editor({ profile, games, onDone, onBack }: { profile: Profile | null; games: GalleryGame[]; onDone: (profile: Profile) => void; onBack: () => void }) {
  const [avatar, setAvatar] = useState<Avatar>(() => (profile === null ? randomAvatar(Math.random) : profile.avatar))
  const [name, setName] = useState(profile === null ? '' : profile.name)
  const [tab, setTab] = useState<Part>('skin')
  /** What waits for its second tap: a game to start over, or removing the player. */
  const [armed, setArmed] = useState<SavingGame | 'remove' | null>(null)
  const [saved, setSaved] = useState<SavingGame[]>(() => (profile === null ? [] : savedGames(profile.id)))
  const trimmed = name.trim()

  const done = () => {
    if (trimmed === '') return
    if (profile === null) return onDone(addProfile(trimmed, avatar))
    const changed = { ...profile, name: trimmed, avatar }
    updateProfile(changed)
    onDone(changed)
  }

  return (
    <div className="profiles-screen editor">
      <h1>{profile === null ? 'New player' : trimmed === '' ? 'Your player' : trimmed}</h1>
      <div className="editor-top">
        <div className="editor-face">
          <AvatarPicture avatar={avatar} className="avatar huge" />
          <button type="button" className="pill surprise" onClick={() => setAvatar(randomAvatar(Math.random))}>
            🎲 Surprise me!
          </button>
          <label className="name-field">
            <span>Name</span>
            <input value={name} maxLength={NAME_MOST} placeholder="Type your name" autoComplete="off" spellCheck={false} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && done()} />
          </label>
        </div>
        <div className="editor-parts">
          <div className="tabs" role="tablist">
            {TAB_ORDER.map((part) => (
              <button key={part} type="button" role="tab" aria-selected={tab === part} className={tab === part ? 'tab on' : 'tab'} onClick={() => setTab(part)}>
                <span className="tab-icon" aria-hidden="true">
                  {TABS[part].icon}
                </span>
                {TABS[part].label}
              </button>
            ))}
          </div>
          <div className="choices">
            {PARTS[tab].map((choice) => {
              const tried = { ...avatar, [tab]: choice } as Avatar
              return (
                <button key={choice} type="button" className={avatar[tab] === choice ? 'choice on' : 'choice'} aria-label={choice} onClick={() => setAvatar(tried)}>
                  <AvatarPicture avatar={tried} className="avatar" />
                </button>
              )
            })}
          </div>
        </div>
      </div>
      {profile !== null && (
        <section className="saved">
          <h2>Saved games</h2>
          {saved.length === 0 && <p className="nothing">Nothing saved yet.</p>}
          {games
            .filter((g) => saved.includes(g.folder))
            .map((g) => (
              <div key={g.folder} className="saved-game">
                <span className={`${g.className} mini`}>
                  <span className="picture" aria-hidden="true" dangerouslySetInnerHTML={{ __html: g.picture }} />
                </span>
                <span className="saved-name">{g.name}</span>
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
                  {armed === g.folder ? 'Really start over?' : 'Start over'}
                </button>
              </div>
            ))}
        </section>
      )}
      <div className="editor-buttons">
        <button type="button" className="pill back" onClick={onBack}>
          Back
        </button>
        <button type="button" className="pill done" disabled={trimmed === ''} onClick={done}>
          ✓ Done
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
          {armed === 'remove' ? `Really remove ${profile.name}?` : 'Remove player'}
        </button>
      )}
    </div>
  )
}
