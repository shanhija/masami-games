# Foot Chase

A side-view 3D chase for two players, built for a five-year-old and whoever is sitting next to them: the police officer chases the robber down a street of houses, on foot, from left to right. The robber grabs the money bag off every porch it passes; the police tries to get within arm's reach. Both run on their own. Each player jumps, sprints or slows down their own runner, and that is the whole game.

- **The robber** (right side of the keyboard and screen) scores a coin for every money bag it grabs, and five more for getting far enough ahead to get away. Caught, it drops half its coins, gets a head start, and the chase starts over.
- **The police** (left side) scores a star for every catch. It is a little faster, so a clean chase closes in about half a minute; everything else on the street decides it sooner.

What gets in the way: the fence at the end of every yard (jump it, or crash through it and stumble), the dog in some yards (it charges whoever comes in; jump it, or it hangs on your leg until you hop it off), and the road crossings with cars (jump the road in a gap, or wait for one). A stumble costs a couple of seconds and a lot of dizzy stars.

What turns a chase around: the surprise crates. A crate is blue with a star for the police or purple with a mask for the robber, and only that runner can open it, by running into it or landing on it. To the other runner it is a crate: jump onto it and stand on it, or run into it and knock it away with a bonk.

| Police crate | Does |
|---|---|
| Police dog | Runs ahead and grabs the robber, who is slowed for a while. The robber can jump over the dog as it arrives. |
| Roller skates | Fast for five seconds, no sprint needed. |
| Whistle | "STOP, POLICE!": the robber stops dead for a moment, hands up. A robber in the air does not hear it. |
| Magnet | Pulls the robber's coins, and the robber, back: half speed for three seconds. |

| Robber crate | Does |
|---|---|
| Propeller backpack | Flies high and fast over everything for a few seconds. |
| Banana | Drops a peel behind the robber. The police slips on it, unless they jump it. |
| Spring shoes | Huge jumps for eight seconds. |
| Bone | Every dog leaves the robber alone for a while, the police dog included. |

It is golden hour in a toy town: a violet-to-orange sky with the sun going down behind a city skyline, windows coming on, a ferris wheel turning at the fair across the yards, tall dark trees behind the houses, street lamps already lit along the sidewalk and fireflies in the yards. Long warm shadows, a haze over the far town.

Vite, React, TypeScript, react-three-fiber and drei, vitest: the same scaffolding as [`chase/`](../chase/README.md), which is where the toon shading, the camera and the pure sim come from. The design brief is [`design.md`](design.md).

```
npm install                  # at the repo root, once for every game
npm run dev                  # https://localhost:3002/foot-chase/ (also https://$DEV_HOST:3002/foot-chase/ over the VPN)
npx vitest run foot-chase    # the sim under two kinds of player, then every rule on its own
npm run build                # typecheck + static build of every game in dist/, runs from disk
```

## Keys

| Police | Robber | Does |
|---|---|---|
| `W` or `Space`, tap the left half | `↑` or `Enter`, tap the right half | jump (the first press starts the chase) |
| `D` held, or the ▶ pedal | `→` held, or the ▶ pedal | sprint: 1.35× speed, for as long as the three bolts last |
| `A` held, or the ◀ pedal | `←` held, or the ◀ pedal | slow down to 0.4× speed, for waiting out a car |

`Esc` or the ⏸ button pauses, with a menu: keep going, start over, sound, full screen. `M` is sound on/off, `F` is fullscreen. A press in the air is kept for a fifth of a second and fires on landing, so mashing works. While paused, any press or tap outside the buttons just resumes; nothing jumps out of the menu. Starting over lays a fresh street and remounts the scene, so no effect from the old game lingers.

## Layout

```
src/
  game/
    sim.ts        the chase as plain numbers: two runners, the street laid lot by lot, fences,
                  crates and what comes out of them, dogs, roads with cars, bananas, catches
                  and escapes. No three.js.
    sim.test.ts   runs the sim for minutes with a player who hops everything and one who never
                  presses, in both seats; then every rule on its own on an empty street
    game.ts       the running game: sim + sounds + pause/restart + a version the HUD subscribes
                  to; the two-player input hook
    sounds.ts     every sound is synthesised (boing, bark, honk, whistle, the propeller's drone)
  scene/
    Stage.tsx     the one Canvas: frame driver, camera that frames both runners and shakes on a
                  crash, the low warm sun and the haze
    Town.tsx      the evening sky and sun, the city skyline with its windows, the ferris
                  wheel and water tower, the trees, the sidewalk with its lamps, the
                  street, the fireflies; every layer wraps in police-local x
    Lots.tsx      what the sim lays along the street: houses with their money bags, fences,
                  crates with the role's picture, roads with cars, banana peels
    Runner.tsx    the two runners from one body; limbs, poses and everything they wear or hold
    Dog.tsx       yard dogs and the police dog
    Effects.tsx   dizzy stars, confetti, spilled coins, dust, sparkles
    Synced.tsx    one component per item in a sim list, keyed by id
    look.ts       the toon gradient and the palette
  Hud.tsx         the words over the picture
```

## How it hangs together

- The scene is drawn relative to the police: its x is always 0, everything else sits at `x - police.x`. The camera only moves to keep both runners in the frame.
- The sim runs once per frame from `Stage`'s `Driver` (priority -1, so it precedes every reader). Scene components read the sim in `useFrame`; only the HUD is React state, driven by a version that bumps when anything it shows has changed.
- The street is a list of lots laid ahead of the leading runner: a yard is a house with the bag on the porch, maybe a crate and a dog, and a fence at the end; every few yards a road takes a lot instead. Whatever falls well behind the police is dropped. The scene re-reads each list every frame and mounts a component per id.
- A runner's height is the path, a crate top, or the propeller's altitude; a runner that was up at crate height lands on the crate, one coming at it lower hits the side. After any crash a runner cannot crash again for a second, so a fence and a crate right after it cost one stumble, though both still go flying.
- Dogs are simple: a yard dog charges the nearest runner in its yard that has not got past it, and never follows anyone out; once you have jumped it, it trots home. The police dog runs straight at the robber, and gives up if it runs right under a robber in the air.
- The loops around the chase run themselves: caught, the robber hops in the officer's grip for a couple of seconds and then runs off until the head start is back; got away, the police runs after it until the head start is back. In the loops nothing can trip either runner and both hop whatever is in the way.
- Tuning lives in the constants at the top of `sim.ts`.
