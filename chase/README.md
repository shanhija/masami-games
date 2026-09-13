# Police Chase

A side-view 3D chase for a five-year-old: the police car chases the robber car from left to right. Rocks, logs, cakes and barrels turn up on the road. The player drives one car and jumps with space (or a tap); the other car drives itself and never misses a jump. Miss one and your car bonks into it, the screen shakes, the driver sees stars and the other car gains on you.

- **As the police** (the default) you are the faster car. Catch the robber for a star; the robber then floors it and the chase starts over.
- **As the robber** you are the faster car. Pull clear to get a coin; the police then floor it back to your bumper and the chase starts over. Crash and the police pounce, and if they catch you it is their turn to celebrate.

The day turns in a minute: sunrise on the left, sunset on the right, then stars, a moon, and headlights and the light bar lighting the road until morning. At night everything runs a quarter faster, and worms come up out of the road: a few as the sky turns at dusk and dawn, nothing but worms at full dark, closer together than the day's rocks, all crawling toward the cars. Jump them like anything else; drive through one and it climbs in, the driver shrieks and the car is held back until your next jump flings it out (or it gets bored after a few seconds).

Vite, React, TypeScript, react-three-fiber and drei, vitest: the same scaffolding as the presentation deck it started in.

```
npm install
npm run dev        # https://localhost:3002 (also https://$DEV_HOST:3002 over the VPN)
npm test           # the sim under three kinds of driver
npm run build      # typecheck + static build in dist/, runs from disk
```

## Keys

| Key | Does |
|---|---|
| `←` `→` or the two buttons | pick the police or the robber, on the start screen |
| `Space` `↑` `Enter` tap click | jump (the first press starts the chase) |
| `→` `D` or the ▶ pedal, held | turbo: flames, 1.35× speed, for as long as the three bolts last |
| `←` `A` or the ◀ pedal, held | brake, down to 0.4× speed |
| `Esc` or the ⏸ button | pause, with a menu: keep going, start over, switch car, sound, full screen |
| `M` | sound on/off |
| `F` | fullscreen |

A press in the air is kept for a fifth of a second and fires on landing, so mashing works.

The throttle changes how you meet the road, not who wins: the turbo tank holds 2.5 s and refills in 10, the other car hurries while it hears your turbo, a crash at turbo is a bigger crash (longer dizzy, harder shake), a jump at turbo has a tighter window, and braking as the robber lets the police right onto your bumper. Flooring it shortens a clean chase from about 11 s to 9 as the police and from 8 s to 6 as the robber; braking as the police never catches anything. While paused, any press or tap outside the buttons just resumes; nothing jumps out of the menu. Starting over resets the sim in place and remounts the scene, so no effect from the old game lingers.

## Layout

```
src/
  game/
    sim.ts        the chase as plain numbers: speeds, jumps, obstacles, crashes, catches, worms. No three.js.
    daylight.ts   the day as a curve of sim time: the sim reads the night for the worms and the speed
    sim.test.ts   runs the sim for minutes in both roles: the self-driving car clears every
                  obstacle; a never-jumping driver still gets somewhere; a perfect driver never crashes
    game.ts       the running game: sim + sounds + pause/restart + a version the HUD subscribes to; the input hook
    sounds.ts     every sound is synthesised (siren, boing, bonk, fanfare)
  scene/
    Stage.tsx     the one Canvas: frame driver, camera that frames both cars and shakes on a crash, lights
    Car.tsx       the two cars from one open-top body; motion (pitch, squash, bob, dizzy) shared
    World.tsx     sky with sun, moon and stars, road, hills, trees, flowers, clouds; every layer wraps in police-local x
    daylight.ts   the day's colours and the sun's arc, over game/daylight.ts, for the sky, the lights and the headlights
    Obstacles.tsx one model per kind; knocked ones fly off
    Worm.tsx      the worm, on the road and riding along
    Effects.tsx   dizzy stars, confetti, dust
    Puffs.tsx     exhaust
    look.ts       the toon gradient and the palette
  Hud.tsx         the words over the picture
```

## How it hangs together

- The scene is drawn relative to the police car: its x is always 0, everything else sits at `x - police.x`. The camera only moves to keep both cars in the frame, and the perspective gives the parallax for free.
- The sim runs once per frame from `Stage`'s `Driver` (priority -1, so it precedes every reader). Scene components read the sim in `useFrame`; only the HUD is React state, driven by a version that bumps on phase, score, mute and the moment after a crash.
- The self-driving car takes its speed only on the ground and keeps it in the air, so a take-off lead of half a flight at the closing speed always puts the apex over the obstacle. That is what makes its auto-jump exact, and the tests hold it to that in both roles. Worms fit this because every worm crawls at the same constant speed for as long as it lives: the closing speed is known at take-off and nothing on the road ever overtakes anything else. The player's car instead eases toward its speed, which is the crash slowdown wearing off.
- Caught, the two cars ride as one, but the lock only holds while both are on the ground: in the air each keeps the speed it took off with, and on landing the police is drawn back to the bumper.
- Tuning lives in the constants at the top of `sim.ts`. As the police a clean chase takes eleven to thirteen seconds with three or four jumps, and a never-jumping driver still catches up in the end; as the robber a clean escape takes about eight seconds and a never-jumping driver is caught after three crashes or so. Crash recovery runs on road covered, not seconds, so the faster night costs the same.
