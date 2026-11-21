import { useLayoutEffect, useState } from 'react'

import { AvatarPicture } from './Avatar'
import { Editor, type GalleryGame } from './Editor'
import { loadProfiles, pickedHere, pickedProfile, pickProfile, type Profile } from './profiles'

/** What the gallery shows: who is playing, a player being made or changed, or the games with the player's chip over them. */
type Screen = { kind: 'choose' } | { kind: 'edit'; profile: Profile | null } | { kind: 'games'; profile: Profile }

/**
 * The players over the game directory. A fresh tab asks who is playing; a tab back from a
 * game shows the games straight away, as the same player. The body's `data-screen` says which
 * is up, so the stylesheet hides the cards while the player is asked or edited.
 */
export function Gallery({ games }: { games: GalleryGame[] }) {
  const [screen, setScreen] = useState<Screen>(() => {
    const profile = pickedHere() ? pickedProfile() : null
    return profile === null ? { kind: 'choose' } : { kind: 'games', profile }
  })

  useLayoutEffect(() => {
    document.body.dataset.screen = screen.kind
    window.scrollTo(0, 0)
  }, [screen])

  const play = (profile: Profile) => {
    pickProfile(profile.id)
    setScreen({ kind: 'games', profile })
  }
  const choose = () => setScreen({ kind: 'choose' })

  switch (screen.kind) {
    case 'choose':
      return (
        <div className="profiles-screen chooser">
          <h1>Who is playing?</h1>
          <div className="who">
            {loadProfiles().map((profile) => (
              <div key={profile.id} className="player">
                <button type="button" className="player-pick" onClick={() => play(profile)}>
                  <AvatarPicture avatar={profile.avatar} className="avatar big" />
                  <span className="player-name">{profile.name}</span>
                </button>
                <button type="button" className="edit" aria-label={`Change ${profile.name}`} onClick={() => setScreen({ kind: 'edit', profile })}>
                  ✏️
                </button>
              </div>
            ))}
            <button type="button" className="player-pick" onClick={() => setScreen({ kind: 'edit', profile: null })}>
              <span className="new-player" aria-hidden="true">
                +
              </span>
              <span className="player-name">New player</span>
            </button>
          </div>
        </div>
      )
    case 'edit':
      // A new player plays at once; a changed one goes back to the players.
      return <Editor key={screen.profile === null ? 'new' : screen.profile.id} profile={screen.profile} games={games} onDone={screen.profile === null ? play : choose} onBack={choose} />
    case 'games':
      return (
        <button type="button" className="player-chip" aria-label={`${screen.profile.name} is playing. Change player`} onClick={choose}>
          <AvatarPicture avatar={screen.profile.avatar} className="avatar chip" />
          <span>{screen.profile.name}</span>
          <span className="swap" aria-hidden="true">
            🔁
          </span>
        </button>
      )
  }
}
