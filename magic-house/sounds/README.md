# Magic House's recorded sounds

Magic House plays Silly Billy's twenty synthesised sounds, and these recordings on top of them. The recordings come from CC0 packs on OpenGameArt (public domain: no attribution is needed; they are listed here so they can be found again). They are not kept in git. `npm install` downloads the packs and builds `public/magic-house/recorded/`, which the dev server serves beside the page and `npm run build` copies into `dist/`. `npm run sounds` does the same on its own. The image build fetches them in its `npm ci` step and then runs `npm run sounds` to be sure they are there (`hosting/Dockerfile`).

- [`sources.json`](sources.json) names every download (`packs`: its page and its file) and, for each sound, its length, its level and the recordings it is made of (`sounds`).
- [`build.ts`](build.ts) downloads the packs into `node_modules/.cache/magic-house-sounds` (16 MB, kept for the next build) and makes each recording into a take: trimmed of its silence, cut to the sound's length, levelled on its loudest 200 ms, faded at both ends, mono MP3 at 96 kbps. All of it comes to about 1 MB. `library.json` beside the takes lists each sound's takes and its gain. A build is skipped while `sources.json` and the script are unchanged. The first build takes about a minute, most of it downloading; after that it takes a few seconds.
- With no network, `npm install` says so and goes on without them. The page then plays every name on its synthesised sound and says so once in the console. `npm run sounds` builds them later.

Every sound has a name a designer and a child can tell apart. Nothing in the packs that shoots, screams, cries, hurts, explodes or roars is used; a test holds the names and the files to that. The names are in [`../src/engine/sounds.ts`](../src/engine/sounds.ts), each recorded one with the synthesised sound that stands in for it. A test checks that the names there, the reference's `w.sound` line and `sources.json` agree. Four synthesised names have recordings too (splash, meow, woof, bell): where they are built, the recording plays. `?sounds` on the page plays every sound by its name, so a parent hears them all before the children do.

| Pack (CC0) | Used for |
|---|---|
| [100 CC0 metal and wood SFX](https://opengameart.org/content/100-cc0-metal-and-wood-sfx) | keys, knock, hammer, spring, thump |
| [100 CC0 SFX](https://opengameart.org/content/100-cc0-sfx) | splash, bell, spring, page, plop |
| [40 CC0 water / splash / slime SFX](https://opengameart.org/content/40-cc0-water-splash-slime-sfx) | splash, bubbles, squish |
| [50 RPG sound effects (Kenney)](https://opengameart.org/content/50-rpg-sound-effects) | coins, door, book, page, cloth, steps-wood |
| [80 CC0 RPG SFX](https://opengameart.org/content/80-cc0-rpg-sfx) | chime, coins, pebbles |
| [80 CC0 creature SFX](https://opengameart.org/content/80-cc0-creature-sfx) | woof, critter |
| [Different steps on wood, stone, leaves, gravel and mud](https://opengameart.org/content/different-steps-on-wood-stone-leaves-gravel-and-mud) | steps-wood, steps-leaves |
| [Walking on snow sound](https://opengameart.org/content/walking-on-snow-sound) | steps-snow |
| [Interface Sounds (Kenney)](https://opengameart.org/content/interface-sounds) | click, tick, pluck, yes |
| [85 short music jingles (Kenney)](https://opengameart.org/content/85-short-music-jingles) | tada |
| [54 casino sound effects (Kenney)](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips) | dice |
| [Children's xylophone](https://opengameart.org/content/childrens-xylophone) | xylophone |
| [Kitten mew](https://opengameart.org/content/kitten-mew) | meow |
| [Sheep baa](https://opengameart.org/content/sheep-baa) | baa |
| [Bird chirping sounds](https://opengameart.org/content/bird-chirping-sounds) | tweet |
| [Horse trotting](https://opengameart.org/content/horse-trotting) | clip-clop |
| [Balloon sounds](https://opengameart.org/content/balloon-sounds) | balloon |
| [Group giggling](https://opengameart.org/content/group-giggling) | giggles |
| [Bubbles pop](https://opengameart.org/content/bubbles-pop) | plop |
| [Magic Spell SFX](https://opengameart.org/content/magic-spell-sfx) | sparkle |
