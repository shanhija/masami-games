# Silly Billy

A 3D room full of people, a cat and things, seen from high up like Castle Builder. A child holds the big button, calls an avatar by name and says what to do, in Finnish or in English as the pause card is set: "Aino, heitä pallo Eetulle". What the game already knows happens at once. What it does not know yet, Claude works out while the avatar stands thinking it through under a cloud of turning cogs: a fast model (Haiku) understands the words and sketches any new thing, and a designer model (Opus) writes the new action or thing as code. The code is tested in a sandbox, joins the library on disk, and the next time it is instant. New avatars are made and dressed the same way: "tee uusi tyttö", "anna hänelle iso kihara tukka niinku Gabbylla", "anna hänelle vaaleanpunainen iltapuku", "anna hänelle taikasauva".

The brief is Sami's [`design.md`](design.md); the decisions, the engine's rules and what is still open are in [`plans/silly-billy.md`](../plans/silly-billy.md).

```
npm run dev                     # https://$DEV_HOST:3002/silly-billy/ (the dev server is what invents)
npx vitest run silly-billy      # the engine, the built-ins, the parser, the brain on a fake link, the sandbox, the server with a fake CLI
npm run build                   # the static build plays the library it ships with and invents nothing
```

## What it needs

- **The Claude Code CLI** on this computer, signed in to Sami's subscription: the dev server runs it with no tools, from an empty folder, one process per question. It is found on the `PATH`, in the desktop app's folder (`~/.config/Claude/claude-code/`) or in the VS Code extension; `CLAUDE_BIN` names it outright.
- **Whisper** for the child's voice: belay-that's whisper.cpp build and model under `~/src/belay-that/vendor`, started by the dev server on port 8179 the first time the page opens. It hears the language set on the pause card, primed with the names of who is here. Without it the browser's own recognizer listens (Chrome and Safari, `fi-FI` or `en-US`), and the type box is always there. A change to the dev server's code takes effect on the next request, with no restart (Whisper starts afresh too).

## How to play

| Do | What happens |
|---|---|
| Hold the big button (or Space) and talk, let go | The words show above the button as they are heard; on letting go the command goes. |
| "Aino, hyppää" ("Alice, jump" in English) | Aino jumps. A name first, then what to do; "kaikki" or "everybody" is everybody. Without a name, the last one spoken to (or the face last tapped) does it. |
| Tap a face in the row at the top | The next command without a name goes to them. |
| "Aino, heitä pallo Eetulle" (the first time) | Haiku understands it in 2 to 8 s. Aino says "Hmm, mietitäänpä!" in her bubble and aloud (in English, Alice says "Let me think this through!") and thinks under a cloud of cogs that fills up as Opus writes, for about 10 s more; then she says her answer and throws. The next time it is instant. |
| "Eetu, aja pyörällä joulukuusen yli" | A rough bicycle and Christmas tree pop up at once, Eetu thinks, and about 20 s later the real ones replace them with a sparkle and he rides over the tree. |
| "Mikko, tee kärrynpyörä", "anna Nooralle kruunu" | A new move (a cartwheel, measured 14 s from the words) or a new thing to wear (a crown, 11 s): anything the game does not know yet is made the same way. |
| "tee uusi tyttö", then "anna hänelle ..." | A new girl joins with a name of her own (Ella, or Olivia in English, unless the child gives one); "her" is the newest one. What she is given becomes part of her look and stays; what she wore there before goes in a sparkle. |
| The room buttons, or "mennään metsään" | The playground, the swimming pool, the forest. Each room keeps its things. |
| "Leikitään hippaa", "Aino ja Eetu pelaa jalkapalloa" | A game together: tag, football, hide and seek, a race or a train, for everyone or for those named. The first one named starts it and is "it", the seeker or the train's front. It lasts half a minute or so; "kaikki seis" stops it, and a new command to one player takes that one out. |
| The type box under the room buttons | Type a command and press Enter or the arrow: the same as saying it. While it has the keys, Space is a space, not the talk button. |
| Pinch, the mouse wheel, or the + and − buttons | Zoom in to see the avatars up close, out to see the whole room; zoomed in, drag to look around, and a double tap goes back to the whole room. |
| `Esc` or the pause button | Pause: keep going, sound, voices (the avatars answer aloud in the game's language), Suomi (the default) or English: everything shown, said and heard follows it, and the starting avatars are Aino, Eetu, Mikko, Noora and Mirri in Finnish, Alice, Steve, Mike, Nora and Luna in English; forget the newest thing (tap twice; only with the dev server), full screen, more games. |

The camera stands back to show the whole room, Castle Builder's view, unless the child zooms in (as far as 2 m of ground across the screen; only for the visit). When someone does something it moves in on them, on who and what their command names and on anything still flying, and goes back out 2.5 s after the last one stops; when a made thing's real model replaces its rough one, the camera shows it up close for 3 s.

At the top left, the line heard and how long understanding took ("ymmärretty 3,2 s", in English "understood 3.2 s"), and a card for each thing being made with what is happening and for how long: "Mietitään: kärrynpyörä 12 s", "Piirretään: kruunu", "Kokeillaan", "Yritetään uudestaan" ("Thinking this through: cartwheel 12 s", "Drawing: crown", "Trying it out", "Trying again"). If the microphone is refused or missing, the big button shows a crossed-out microphone and "Ei mikrofonia" ("No microphone"), and the type box glows to show where to type; with nothing to listen at all, there is no big button and the type box glows ("Kirjoita, mitä tehdään", "Type what to do"). On a phone the faces get the whole top row. On an iPad the first touch turns on the sound and the voices.

The name tags and speech bubbles stay beside their owners and on the screen, and keep their side as people move; in a thick crowd the nearer one covers the farther. The voices speak the game's language and take turns: lines said at the same moment are heard one after another, each avatar in its own voice ("aino ja eetu sanokaa hei" is two hellos). A browser with no voice for the language says nothing.

The game waits at most 45 s for Haiku and 90 s for a new thing or action (both tries together); past that whoever waited shrugs, so a child is never left waiting for something stuck. When the page stops waiting, the dev server stops the model too.

Misheard words are part of the fun: the game always does something with what it heard, the closest-sounding avatar answers, and nobody ever gets hurt (a hit is a bonk, a tumble and a giggle).

## The built-ins

- **The cast**, called by the game's language: Aino / Alice (a ginger ponytail, purple top), Eetu / Steve (a red cap, blue shirt), Mikko / Mike (a tall grown-up with glasses), Noora / Nora (blonde pigtails, pink dress) and Mirri / Luna the orange cat. Made avatars join them and stay, named from a list for each language (Ella, Leo, Venla...; Olivia, Jack, Hannah...) unless the child names them; their names, and any name the child gives, stay in both languages.
- **The basic verbs**: walk, run, come, pick up, drop, give, jump, wave, sit, sleep, spin, say, follow, look, make, remove, wear, take off, paint, grow, shrink, rename. Throwing, riding, dancing, swimming, climbing and everything else is invented the first time it is asked for.
- **The group games**, for several avatars together: tag (hippa), football (jalkapallo, with a red and a blue goal put up for the game), hide and seek (piilosta), a race (kilpajuoksu, a swimming race in the pool) and a train (juna, follow the leader).
- **The rooms and their things**: the playground (slide, swings, seesaw, sandbox, climbing frame, roundabout, benches, trees, balls), the swimming pool (the pool to wade and float in, diving board, loungers, parasols, swim rings, a beach ball, rubber ducks, palms) and the forest (pines, rocks, logs, stumps, big red mushrooms, a tent, a campfire, a pond).

## The library

Everything made lives in [`library/`](library/): `items/<id>.json`, `actions/<id>.json`, `avatars/<id>.json` (a made avatar, or a starting one whose look changed) and `phrases.json` (words heard before and what they meant, so the same words need no model at all; words that point ("hän", "hänelle", "heille", "se", "sille", "toiselle", "molemmille", "kaikki") are not kept, since they mean someone else the next time; a phrase is kept only once every thing it uses was saved and only if it would play as it is, and a plan cut short by newer words is not kept). Each entry keeps the child's words that asked for it, the designer's code and the guarded code the page runs, and its name in Finnish. The dev server reads the folder back when it starts, so a reboot keeps everything, and the build ships it, so what was made at home plays on the hosted page too. Reading it brings a library from before the game had two languages up to date: an action or a thing takes its first Finnish word as its Finnish name, and the phrases from then are dropped (their words are understood afresh). `library/log.jsonl` (not in git) logs every command, plan, invention, test and timing. "Forget the newest thing" on the pause card removes the newest made thing and the phrases that used it; deleting a file by hand removes anything older, and words that used it are then worked out afresh.

## How new code is kept safe

The designer writes plain JavaScript against the engine's small API ([`src/engine/apidoc.ts`](src/engine/apidoc.ts) is exactly what it is told). Generated code never runs in Node on the laptop. The walls round it, outermost first:

- **The guard** ([`src/server/guard.ts`](src/server/guard.ts)), on the dev server: the code is parsed and refused, like a syntax error with the designer's line, if it names anything but its own names, its params and a few plain built-ins (Math, JSON, Array, Object, Map, Set, ...), reaches for keys like `constructor`, `prototype` or `__proto__`, or calls `import()`. Keys worked out at run time are checked as the code runs, and a refused one names its line. A guard call goes into every loop and function, so a loop that never yields is stopped. The code is guarded afresh when it is saved and when the library is read (a file guarded by an older guard is rewritten); the tests read the library the same way before every build, so a commit ships today's guarded code, and they fail on an entry the guard refuses.
- **The test**: the page runs new code first in a throwaway Web Worker against a copy of the world, for up to 20 game seconds and killed after 4 real ones, an action also with its optional args left out, a thing's process lying about and, if it can be worn, worn, within the time it gets in play. An error goes back to the designer once to fix; a thing that works but lost some of its shapes plays at once and goes back once with what was lost. Only code that passed is saved.
- **At play time**: strict mode with the page's globals shadowed; an action or a thing's process that takes too long in real time is stopped (the action ends with a shrug, the process is taken away); every error ends the action with a shrug; every number it writes is made finite and kept inside the room. One gap is left: a single huge call into the browser itself (an array of a billion) can still hold the page once.
- **The dev server's API** answers only the game's own page: a request from a page of another site gets a 403.

## For the parent

| Setting | Does |
|---|---|
| `?say=Aino, hyppää` | Hears these words when the game starts (repeat it for several). `window.game.hear(text)` does the same from the console. |
| `SILLY_LIBRARY=<folder>` | The dev server keeps the library there instead of `silly-billy/library/` (for trying things out without touching the real one). |
| `SILLY_INTERPRET_MODEL`, `SILLY_INVENT_MODEL` | The models for understanding and for inventing (`haiku` and `opus`). |
| `SILLY_WHISPER_BIN`, `SILLY_WHISPER_MODEL`, `SILLY_WHISPER_PORT` | Another whisper.cpp server, model or port. |
| `CLAUDE_BIN` | The Claude Code CLI to run. |

The rooms (what lies where) are kept in the browser's `localStorage` under `silly-billy-rooms-1` and the settings (sound, voices, language) under `silly-billy-settings`; the avatars and everything made are kept in the library.
