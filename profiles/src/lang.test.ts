/**
 * Every game speaks the player's language: no word a child sees or hears is written in one
 * language only. The check reads the code of every folder with a `src/main.tsx` (the gallery
 * too), so it holds whatever the folders become, and finds words where they are written:
 *
 * - JSX text, and literal text in `aria-label`, `title`, `placeholder`, `alt` and `label`;
 * - literal text a JSX child or one of those attributes shows (`{on ? 'Sound on' : 'Sound off'}`);
 * - literal text given to the canvas's `fillText` or `strokeText`;
 * - anywhere else, a literal that reads as words for a person: a capital and a small letter at
 *   its start ('Garden', 'Keep going'), or a `!` or `?` after a letter at its end ('oh no!').
 *
 * Words are written as `{ en, fi }`, both texts there and not empty, without an em-dash; a
 * game keeps its own in `src/words.ts` (plans/finnish-and-english.md). What a person never sees
 * is left alone: thrown errors, the console, imports, Silly Billy's `about` texts, and the few
 * files named in DEV_ONLY.
 */

import fs from 'node:fs'

import { parseAst } from 'vite'
import { describe, expect, it } from 'vitest'

/** Games not yet in both languages. Each leaves this list in the commit that makes it so; then the list goes. */
const PENDING = new Set(['chase', 'foot-chase', 'pia-jump', 'rocket-factory', 'super-me', 'digger-town', 'silly-billy'])

/** Files only a developer sees (the `?sheet` pages), or that only a model reads (Silly Billy's dev server, its guard of made code, the API and the scene as the interpreter and the designer are told them). */
const DEV_ONLY: readonly RegExp[] = [/\/Sheet\.tsx$/, /^silly-billy\/src\/server\//, /^silly-billy\/src\/engine\/(sandbox|apidoc)\.ts$/, /^silly-billy\/src\/brain\/context\.ts$/]

/** Literals that look like words and are not: key names, fonts. */
const NOT_WORDS = new Set(['Enter', 'Escape', 'Space', 'Tab', 'Shift', 'Backspace', 'Control', 'Alt', 'Meta', 'Delete', 'Home', 'End', 'Fredoka', 'Fredoka Variable'])
/** Names in code that look like words and are not: key codes ('KeyW', 'ArrowLeft'), names with two capitals ('NotAllowedError', 'BlockStatement'), chords ('Am', 'Bb7'). */
const NOT_WORDS_LIKE: readonly RegExp[] = [/^(Key[A-Z]|Digit\d|Numpad\w+)$/, /^\p{Lu}\p{Ll}+(\p{Lu}\p{Ll}*)+$/u, /^[A-G][b#]?(m|maj|dim|aug|sus)?\d*$/]

/** Properties whose text only a model reads: Silly Billy's `about` of an action or a thing. */
const MODEL_ONLY = new Set(['about'])

/** The JSX attributes whose text a person reads or hears. */
const TEXT_ATTRIBUTES = new Set(['aria-label', 'aria-description', 'aria-roledescription', 'title', 'placeholder', 'alt', 'label'])

// The AST is ESTree with TypeScript's nodes (oxc's, through Vite), read loosely.
type Node = { type: string; start: number; end: number; [key: string]: unknown }

const isNode = (v: unknown): v is Node => typeof v === 'object' && v !== null && typeof (v as Node).type === 'string'
const twoLetters = (text: string) => /\p{L}[^]*\p{L}/u.test(text)

/** The text of a string literal or a template (its fixed parts), or null for anything else. */
function textOf(node: Node): string | null {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value
  if (node.type === 'TemplateLiteral') return (node.quasis as Node[]).map((q) => (q.value as { cooked: string }).cooked).join(' ')
  return null
}

/** The literals an expression shows: itself, either branch of `?:`, what `&&` gives, either side of `||` and `??`. */
function shown(node: Node): Node[] {
  if (textOf(node) !== null) return [node]
  switch (node.type) {
    case 'ConditionalExpression':
      return [...shown(node.consequent as Node), ...shown(node.alternate as Node)]
    case 'LogicalExpression':
      return node.operator === '&&' ? shown(node.right as Node) : [...shown(node.left as Node), ...shown(node.right as Node)]
    case 'ParenthesizedExpression':
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
      return shown(node.expression as Node)
    default:
      return []
  }
}

/** Whether a literal anywhere else reads as words for a person. */
function readsAsWords(text: string): boolean {
  const t = text.trim()
  if (NOT_WORDS.has(t) || NOT_WORDS_LIKE.some((re) => re.test(t))) return false
  return /^\p{Lu}\p{Ll}/u.test(t) || (/\p{L}[!?]$/u.test(t) && /\s|\p{Lu}/u.test(t))
}

const keyName = (key: unknown) => (isNode(key) ? (key.type === 'Identifier' ? (key.name as string) : key.type === 'Literal' ? String(key.value) : null) : null)

/** Whether an object literal is words in both languages: it has `en` and `fi`. */
function isWords(node: Node): boolean {
  if (node.type !== 'ObjectExpression') return false
  const keys = new Set((node.properties as Node[]).map((p) => keyName(p.key)))
  return keys.has('en') && keys.has('fi')
}

/** What is wrong with one file's words, each as "line: what: the text". */
function wordsTrouble(code: string, file: string): string[] {
  const trouble = new Map<number, string>()
  const lineOf = (at: number) => code.slice(0, at).split('\n').length
  const report = (node: Node, what: string, text: string) => void (trouble.has(node.start) || trouble.set(node.start, `${file}:${lineOf(node.start)}: ${what}: ${JSON.stringify(text.trim())}`))
  const inWordsFile = /\/words\.ts$/.test(file)

  const visit = (node: Node, free: boolean): void => {
    switch (node.type) {
      case 'ImportDeclaration':
      case 'ExportAllDeclaration':
      case 'ImportExpression':
      case 'ThrowStatement':
        return
      case 'NewExpression':
      case 'CallExpression': {
        const callee = node.callee as Node
        if (callee.type === 'Identifier' && /Error$/.test(callee.name as string)) return
        if (callee.type === 'MemberExpression') {
          const object = callee.object as Node
          const property = keyName(callee.property)
          if (object.type === 'Identifier' && object.name === 'console') return
          if (property === 'fillText' || property === 'strokeText') for (const lit of shown((node.arguments as Node[])[0]!)) if (twoLetters(textOf(lit)!)) report(lit, 'drawn on the canvas', textOf(lit)!)
        }
        break
      }
      case 'JSXText':
        if (twoLetters(node.value as string)) report(node, 'JSX text', node.value as string)
        return
      case 'JSXAttribute': {
        const name = keyName(node.name) ?? (isNode(node.name) ? (node.name.name as string) : '')
        const value = node.value
        if (TEXT_ATTRIBUTES.has(name) && isNode(value)) {
          const lits = value.type === 'JSXExpressionContainer' ? shown(value.expression as Node) : shown(value)
          for (const lit of lits) if (twoLetters(textOf(lit)!)) report(lit, name, textOf(lit)!)
        }
        break
      }
      case 'JSXElement':
      case 'JSXFragment':
        for (const child of node.children as Node[]) if (child.type === 'JSXExpressionContainer' && isNode(child.expression)) for (const lit of shown(child.expression)) if (twoLetters(textOf(lit)!)) report(lit, 'shown in JSX', textOf(lit)!)
        break
      case 'Property':
        if (MODEL_ONLY.has(keyName(node.key) ?? '')) return
        break
      case 'ObjectExpression':
        if (isWords(node)) {
          for (const p of node.properties as Node[]) {
            const lang = keyName(p.key)
            if (lang !== 'en' && lang !== 'fi') continue
            const value = p.value as Node
            const text = textOf(value)
            if (text !== null && text.trim() === '') report(value, `no ${lang === 'en' ? 'English' : 'Finnish'}`, text)
            visitWords(value)
          }
          for (const p of node.properties as Node[]) if (!['en', 'fi'].includes(keyName(p.key) ?? '')) visit(p, free)
          return
        }
        break
      case 'Literal':
      case 'TemplateLiteral': {
        const text = textOf(node)
        if (text !== null) {
          if (text.includes('—')) report(node, 'an em-dash', text)
          if (!free && !inWordsFile && readsAsWords(text)) report(node, 'words in one language', text)
        }
        break
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'type' || key === 'start' || key === 'end') continue
      if (Array.isArray(value)) for (const v of value) if (isNode(v)) visit(v, free)
      if (isNode(value)) visit(value, free)
    }
  }
  /** Inside the `en` or `fi` of words: any text is fine, but not an em-dash. */
  const visitWords = (node: Node): void => {
    const text = textOf(node)
    if (text !== null && text.includes('—')) report(node, 'an em-dash', text)
    for (const [key, value] of Object.entries(node)) {
      if (key === 'type' || key === 'start' || key === 'end') continue
      if (Array.isArray(value)) for (const v of value) if (isNode(v)) visitWords(v)
      if (isNode(value)) visitWords(value)
    }
  }

  visit(parseAst(code, { lang: file.endsWith('.tsx') ? 'tsx' : 'ts' }) as unknown as Node, false)
  return [...trouble.entries()].sort((a, b) => a[0] - b[0]).map(([, line]) => line)
}

/** Every folder with a page of its own: the games and the gallery. */
const folders = fs.readdirSync('.', { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(`${d.name}/src/main.tsx`)).map((d) => d.name)

/** Every file of a folder's code that is not a test. */
const codeOf = (folder: string) =>
  fs
    .readdirSync(`${folder}/src`, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.ts$/.test(file) && !/(^|\/)testing\.ts$/.test(file))
    .map((file) => `${folder}/src/${file}`)
    .filter((path) => !DEV_ONLY.some((re) => re.test(path)))

describe('both languages', () => {
  it.each(folders.filter((f) => !PENDING.has(f)))('%s shows and says every word in the player’s language, from its words', (folder) => {
    expect(fs.existsSync(`${folder}/src/words.ts`), `${folder}/src/words.ts`).toBe(true)
    const trouble = codeOf(folder).flatMap((path) => wordsTrouble(fs.readFileSync(path, 'utf8'), path))
    expect(trouble).toEqual([])
  })

  it('lists as pending only games that are there', () => {
    for (const game of PENDING) expect(folders, game).toContain(game)
  })

  it('finds words in one language wherever a child would meet them, and leaves the rest alone', () => {
    const code = `
      import { thing } from './Some Module'
      type Shout = 'Wow!' | 'oops'
      const LEVEL = { name: 'Garden', id: 'garden' }
      const SAY = { go: { en: 'Go!', fi: 'Mennään!' }, empty: { en: 'Hi', fi: '' }, dash: { en: 'Wait — now', fi: 'Odota' } }
      export function Hud({ on }: { on: boolean }) {
        if (!on) throw new Error('Nothing to show')
        console.warn('Hud: Shown twice')
        ctx.fillText('Score', 0, 0)
        ctx.fillText(\`\${n}\`, 0, 0)
        return (
          <div className="hud big" aria-label="pause" title={on ? 'Sound on' : SAY.go.en}>
            Keep going <kbd>W</kbd> {on && 'paused'} {'🔊'}
            <button onClick={() => key === 'Enter' && go()} />
          </div>
        )
      }
    `
    expect(wordsTrouble(code, 'game/src/Hud.tsx').map((line) => line.replace(/^[^:]*:\d+: /, ''))).toEqual([
      'words in one language: "Wow!"',
      'words in one language: "Garden"',
      'no Finnish: ""',
      'an em-dash: "Wait — now"',
      'drawn on the canvas: "Score"',
      'aria-label: "pause"',
      'title: "Sound on"',
      'JSX text: "Keep going"',
      'shown in JSX: "paused"',
    ])
  })
})
