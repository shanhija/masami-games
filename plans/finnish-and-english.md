# Finnish and English

Every game, the gallery and Silly Billy play in Finnish or in English. The player picks the language with a flag in their profile, and every word a child sees or hears follows it: buttons, cards, shouts, names of things, spoken words, and what the game listens for. The repo itself is English: folder and file names, code, comments, docs and plans. Finnish is left only in the games' words, in quoted Finnish speech, and in the briefs (`design.md`), which stay in the language Sami wrote them in. Asked by Sami on 2026-11-21; the open points were settled by Sami the same day.

The work spans every game, and the folders are changing while it is planned. So this plan says how a game is made bilingual and how that is checked, and it lists only what each game needs beyond that. Each game is surveyed again when its turn comes. The per-game notes below come from the survey of 2026-11-21.

## Decisions

### The language belongs to the player

- **`Profile.lang: Lang`** (`'fi' | 'en'`). The editor has a row of two big flags under the name, Finland and the United Kingdom (the repo writes British English: "colour", "jumper"). Profiles draws the flags as SVG, like the avatars, because emoji flags do not show on every system. The language is changed only in the editor, so a child cannot switch it by accident. Each player on "Who is playing?" has a small flag on their avatar, and so does the player chip, so a parent can see who plays in which language.
- **A new player** starts in English (Sami, 2026-11-21).
- **A player saved before this** has no language and plays in Finnish (Sami, 2026-11-21). The editor saves it from then on. Silly Billy's pause card loses its Suomi/English setting, and what it held is not read.
- **The gallery's language** is the picked player's. Before anyone is picked, it is the language of the player last picked on this device, or else English. The gallery's heading, card names, blurbs, player counts, the editor and `<html lang>` all follow it.
- **A game reads the language once, when it starts.** `enterGame(game)` returns `{ saves, lang }` instead of the saves alone. Police Chase and Foot Chase keep nothing and need no player, so they ask `playerLang()`: the picked player's language, or the gallery's fallback, with no trip to the gallery. A browser that keeps no site data plays in English. A changed flag counts from the next game started; a game already open in another tab keeps its language until it is reloaded.

### How a game holds its words

- **One shared module, `profiles/src/lang.ts`**, holds `Lang`, `LANGS`, `Words = { en: string; fi: string }` (both texts required, so the compiler catches a missing translation), `inLang`, the speech tag for each language (`fi-FI`, `en-GB`), and `startPage(lang, title)`, which sets `<html lang>` and `document.title`. Silly Billy's `engine/lang.ts` imports these. It keeps only what is its own: `string | Words` for names and the child's own words, `wordsOf` for made code, `useLang` and `CastNames`.
- **`profiles/src/directory.ts`** lists each game's folder with its name, blurb and player count in both languages. The gallery's cards keep only their link and picture in the root `index.html` and take their words from this list. The editor's saved-games list and every game's `startPage` read their names from it too.
- **Each game keeps its words in one file, `<game>/src/words.ts`.** It holds every word the child sees or hears, both languages side by side, so reading that one file checks a game's Finnish. React gets `lang` as a prop from `main.tsx` through `App`. Canvas drawing gets it as an argument. Words are picked where they are shown, never stored in state.
- **Game logic stays language-free.** Some logic now builds or stores English: shouts typed as English words, spoken words carried in sim events, level and course names copied into state, names that double as keys. All of that changes to ids, and `words.ts` turns an id into words. Tests then check the id, not the English.
- **Every button and thing gets a real name.** Some `aria-label`s are raw ids today ('belltower', 'roundGlasses', a filling's id). They get proper names in both languages. Code that finds a button by its label (Rocket Factory's `Hand.tsx` looks for "Bubbles") finds it by a `data-` attribute instead.
- **Finnish grammar is written out, not generated.** A line with a name or a number in it is a function in `words.ts`, written separately for each language. Where Finnish needs a case ending, the whole phrase is stored for each thing: "Lounas Munchille!", "Puistoon", "Pelaa poliisina", "Löysit Sunnyn!". Where a sentence would need many forms, a picture and a number replace it.
- **The Finnish is simple standard Finnish that a five-year-old hears**: short words and plain sentences, under the same human-written rule as the English (no em-dashes). Claude writes it, and Sami tunes it in `words.ts` while playing.
- **Finnish words are longer** ("Hampurilainen!", "Syntymäpäivä"). Every card, button, bubble and title must fit in both languages, at phone width and on the tablet. Titles drawn letter by letter, such as Digger Town's two-line DIGGER / TOWN logo, take the Finnish name and its own layout.
- **What stays English**: ids, code, comments, docs, plans, test names, and text only a developer sees (`?debug` overlays, `?sheet`, errors, logs). Silly Billy's interpreter and designer prompts and its `about` texts also stay English, because the child never sees them.

### Game names in Finnish (Sami, 2026-11-21)

| Folder | English | Finnish |
|---|---|---|
| (gallery) | Masami Games | Masamin pelit |
| `chase/` | Police Chase | Poliisijahti |
| `foot-chase/` | Foot Chase | Juoksujahti |
| `castle-builder/` | Castle Builder | Linnanrakentaja |
| `pia-jump/` | Pia Jump | Pia hyppää |
| `cat-hat-builder/` | Cat Hat Builder | Kissakypärä |
| `rocket-factory/` | Rocket Factory | Rakettitehdas |
| `super-me/` | Super Me | Super-minä |
| `slime-guy/` | Slime Guy | Limaukko (the brief's own name) |
| `monster-lunch/` | Monster Lunch | Hirviön lounas |
| `digger-town/` | Digger Town | Kaivurikylä |
| `silly-billy/` | Silly Billy | Hassu Billy |

Characters' names stay the same in both languages (Pia, Beep, the kittens Sunny, Coco, Mochi, Lulu and Pepper, the monsters Munch and Gulp), except where a game already gives them a name in each language (Silly Billy's starting cast).

### Speaking and hearing

- **Spoken words use the browser's voice for the player's language**: `fi-FI`, or for English `en-GB` first and then any English voice. If there is no voice for the language, the game stays silent. Another language's voice never reads the words (Silly Billy's rule, now every game's). One voice picker, `pickVoice(lang, tone)` in profiles beside `lang.ts`, replaces Silly Billy's choice in `voice/speak.ts` and Rocket Factory's `beepVoice`.
- **Rocket Factory's Beep speaks the player's language** (Sami, 2026-11-21). She spoke English on purpose, as "her second language". For a Finnish player she now speaks Finnish, because every word follows the flag.
- **Digger Town listens in the player's language.** An English player talks English to the machines. The parent's pause card text is also wholly in the player's language. Today it is English with Finnish words to try.
- **Silly Billy hears through Whisper in the player's language**, as it does now through its setting. Only the place the language comes from changes. The work it needs to understand English as well as Finnish is under Silly Billy below.

### English folder and file names

- **Folders** become the kebab-case English name of their game, the same as the gallery's CSS classes already are: `rakennustyömaat/` → `cat-hat-builder/`, `marienpeli/` → `super-me/`, `limaukkopeli/` → `slime-guy/`, `ruokapeli/` → `monster-lunch/`, `rakennuspeli/` → `digger-town/`. Plans follow with `git mv`: `plans/rakennustyömaat.md` → `plans/cat-hat-builder.md` and so on. Every path changes in this one step: `GAMES`, `SAVING_GAMES`, the gallery's links, imports between games (Super Me imports Pia Jump), `CLAUDE.md`, `README.md`, the rules and the plans. The note about the percent-encoded URL goes away.
- **Saves move with their game.** On a device's first load after the rename, profiles moves every `profile/<id>/<old folder>/` key to the new folder, renaming the Finnish key names inside on the way (a key named 'rakennustyömaat' becomes 'cat-hat-builder', 'ruokapeli' becomes 'monster-lunch'). This works like the move of saves from before profiles, and a test covers it. `SAVES_BEFORE_PROFILES` is renamed to match.
- **Old URLs get no redirects** (the repo's rule against legacy shims). A home-screen bookmark to an old game's URL has to be added again. The gallery's own URL does not change.
- **File contents are English, except the briefs** (Sami, 2026-11-21). A game's `design.md` stays in the language Sami wrote it in, Finnish or English, and is never translated: it is Sami's own words, sometimes the child's. Six of them are Finnish today (Foot Chase, Slime Guy, Super Me, Digger Town, Cat Hat Builder, Monster Lunch). Every other file is already English apart from the folder and plan names above, and stays so.

### The check that keeps it so

`profiles/src/lang.test.ts` scans every folder that has a `src/main.tsx`, the same way the localStorage test does, so it keeps working whatever the folders become. Outside `words.ts` it fails on:

- JSX text with letters in it;
- a literal `aria-label`, `title`, `placeholder` or `alt` with letters;
- `fillText` or `strokeText` given a literal with letters;
- a game whose `main.tsx` does not call `startPage`.

In every `words.ts`, both texts of every `Words` must be non-empty and free of em-dashes. Text only a developer sees is exempt through a short allow-list kept beside the test. While the games are being converted, the test reads a list of games not yet done. Each game leaves the list in its own commit, and when the list is empty it is deleted.

## Each game

The size and the hard part of each game, from the survey of 2026-11-21. Every game also gets the common steps: its `words.ts`, `lang` from `main.tsx`, `startPage`, the pause card's shared words (Paused, Keep going, Sound, Music, Full screen, More games), and screenshots in both languages.

- **Police Chase** (small, about 30 strings, all in `Hud.tsx`): "Play as {role}" is stored as a whole phrase for each role; key hints (SPACE, ESC) get their Finnish names (VÄLILYÖNTI, ESC).
- **Foot Chase** (small to medium, about 45 strings): `shoutFor` and `ITEM_SHOUT` in `game.ts` return English words, and the HUD picks colours by comparing them. Both change to ids.
- **Castle Builder** (small, about 22 strings): the build bar's 15 aria-labels are raw ids and need a names table.
- **Pia Jump** (medium): `Shout` is typed as the English words, and the kitten's name is also the key for its coat. Both change to ids (5 assertions in `game.test.ts`). "You found {kitten}!" is stored per kitten. **The ABC blocks spell English words** (HI, SUN, YUM, TUB, FUN, MOON) and are solid tiles in the levels. A block run's word becomes data for each language: a Finnish word of the same length where one fits (YUM → NAM, FUN → ILO), otherwise the map gets a run of the Finnish word's length, checked again by the level tests and the bot. The block letters take Ä and Ö (`room.ts` takes only A to Z now). Kitten staircases keep spelling the names, which stay the same in both languages.
- **Super Me** (small, about 45 strings): `GROUPS` names double as switch keys and change to ids; the 15 present cheers ("A crown!") get a table for each language; the closet's aria-labels are raw ids and need about 70 names. The Pia Jump modules it imports carry no words except the ABC letters, which its levels do not use.
- **Rocket Factory** (medium, about 60 strings): the card words and sticker words travel as English in the sim's `say` events. They change to ids, and `Sounds` gets `lang` through `Game`. The countdown, "Hooray!", "Good night!" and "Munchers!" are spoken in the player's language. A test checks the English rule that a sticker word is the card's word without its plural "s"; Finnish needs a written table instead. `Hand.tsx` finds buttons by their labels and changes to `data-` attributes. About 25 assertions change.
- **Cat Hat Builder** (medium by volume, easy in kind): about 200 strings, about 140 of them screen-reader names (room items, wardrobe looks, materials). `THEME_INFO[].name` moves out of the logic's catalog. The theme cards are sized so "the longest name fits", which has to be checked again with Finnish names. One test's capital-letter regex has to accept Ä and Ö.
- **Slime Guy** (small, about 60 strings plus about 40 names): `COURSE_NAMES` moves out of `model.ts`; "Go to {island}" is stored per island ("Puistoon", "Rannalle"). Many `nowrap` labels need a fit check.
- **Monster Lunch** (small, about 45 strings): `Shout` is typed as English words and is used as CSS class keys. It changes to ids (3 assertions). "Lunch for {monster}!" is stored per monster. The 15 fillings get names.
- **Digger Town** (large, because of English voice control):
  - The interface is about 80 strings, including the parent's pause card and key help. `RANKS[].name` moves out of `model.ts` (2 assertions).
  - English speech: `speech.ts` splits into the part that does not depend on the language (clauses into `Spoken`, the matching machinery) and the words and rules of each language. `Spoken` is already language-free, and `say.ts` and the sim read only that. The English grammar puts prepositions before the noun, skips articles, and matches machine names of several words ("dump truck", "cement mixer", "tower crane", "forklift", "road roller"; "truck" alone is ambiguous). It folds plurals and -ing forms. It needs its own fuzzy thresholds, because English command words are short, and its own child words: "no", "stop", "let's play", "what now".
  - `Voice` takes the player's speech tag. `WORDS_TO_TRY`, the "wanted" word, and the voice bot's `NAME` and `VERB` tables come in both languages.
  - Tests: `speech.test.ts`'s 133 sentences get English twins, and the voice bot plays the whole story by voice in English within the same pars as in Finnish.
  - The interface comes first in its own commit, then English speech.
- **Silly Billy** (medium): see below.

### Silly Billy

- **The language comes from the player.** The pause card's Suomi/English buttons, `Settings.lang`, and the code for switching mid-game go away (the switch cleared bubbles and hushed the voice). `useLang` runs once, when the world is made. The decision **Language** in `plans/silly-billy.md` is rewritten to say this, and its README follows.
- **Whisper** already hears each clip in the language it is told. Finnish-NLP's Finnish fine-tune of large-v3 heard English as well as turbo did on 128 synthetic clips (7.4% of characters wrong). Every whole clip is kept on the laptop, so English players' clips build up under `library/voice/` as `-en`. Once about 50 real ones are marked with `tools/mark.mjs`, `tools/bench.mjs` compares the fine-tune with turbo on English. Whisper switches model by language only if turbo hears children clearly better.
- **English is understood without the interpreter as surely as Finnish.** This matters most on the hosted page, which has no interpreter. On 2026-11-21 the parser, with the vocabulary of its tests, was sure of 27 of 30 everyday commands in Finnish and 23 of the same 30 in English. The English misses were "Steve is running", "go to the slide" and "say hello". "Spin twice" was played as sure but lost its count, which is a bug. The fix:
  - fold English verb and noun endings (-s, -es, -ing, -ed, doubled consonants) before matching;
  - read "once", "twice" and English number words;
  - "go to the X" walks there;
  - "say X" is sure;
  - leave out articles, possessives and "let's".
  
  `parse.en.test.ts` mirrors every Finnish case. A list of 100 everyday English commands is measured the way the Finnish round 1 of review was.
- **Phrases are kept per language** (`lang` on `PhraseEntry` and in the brain's key), closing the gap `plans/silly-billy.md` lists.
- **End to end**: the headless run feeds English commands through `window.game.hear` on the dev server, the same way the Finnish run of 2026-11-09 did, with an English player made by the init script. The two-language gaps listed in `plans/silly-billy.md` (old actions' English-only bubbles, an English heard line with a name guessed from an id) are fixed or stay listed there.

## Order of work

1. **Wait for a still tree.** Done: the work in progress was committed before the rename.
2. **The rename**, alone in one commit: folders, plans, every path, the saves move and its test. Done on 2026-11-21 (typecheck, tests, build, and each renamed game booting in a headless Chromium).
3. **The player's language**: `Profile.lang` with its migration, the flags, the gallery's language, `lang.ts`, `directory.ts`, `enterGame` returning `{ saves, lang }`, `playerLang`, `pickVoice`, and the check with every game on its list of games not yet done. The rules change in the same commit:
   - `CLAUDE.md` and `README.md`: every audience-visible word in both languages, in the game's `words.ts`, chosen by the player's flag. A new game is bilingual from its first commit (`magic-house/`, a game coming, included). Its folder gets the kebab-case English name of the game. Its brief stays in the language it was written in, and every other file is English. The folder list uses the new names.
   - `.cursor/rules/coding-style.md`: its audience-text bullet covers Finnish.
4. **The games, one commit each.** Each commit includes its `words.ts`, ids where logic held English, tests, the check passing for the game, screenshots in both languages (title, play, pause and end cards, at phone and tablet sizes) and a Language line in its plan or README. After step 3 the games are independent of each other, so agents in separate worktrees can do them three or four at a time, sized to fit what is left of the weekly limit (stop at 95%). Order, smallest first:
   1. Police Chase, Castle Builder, Foot Chase, Slime Guy, Monster Lunch, Super Me, Cat Hat Builder;
   2. then Pia Jump and Rocket Factory;
   3. then Digger Town's interface and its English speech;
   4. Silly Billy last.
5. **The rules read through again**, and this plan retired: the shared mechanism, the check and the measured numbers are rescued into `docs/languages.md`, and every citation of this plan is repointed.

## Open

- **The saves move** in profiles can be deleted once every device has opened the gallery after the rename and each player has been saved with a language, together with reading a missing language as Finnish.
