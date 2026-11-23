/**
 * Magic House: the trial's look at made code's text before it runs (engine/api.ts header: a Proxy
 * cannot catch truthiness). A handle's read used without its call, as in `if (p.holding)` or
 * `w.until(() => door.hidden)`, is a function, so it is always true and the room or the walkthrough
 * quietly does the wrong thing. The scan finds such a read where it is used as a condition and says
 * MISTAKES.notCalled with the designer's line.
 *
 * It is a narrow scan on purpose, because a false alarm costs a fix: only the reads that give back
 * true, false or a handle that may be null (READS below), only after a dot, only where nothing calls
 * them, and only in a condition (after `if (`, `while (`, `!`, `&&`, `||` or `=>`, or before `&&`,
 * `||` or `?`). The code's own objects are left alone: a read whose key the code itself writes as an
 * object's key (`{ hidden: true }`, `{ p, holding }`) or assigns (`k.holding = true`) anywhere, and
 * a name whose object the code builds as `name = {`.
 */

import { MISTAKES } from '../engine/api'

/** The reads a condition is written with, and what has each, as MISTAKES.notCalled names it. */
const READS: Readonly<Record<string, string>> = {
  holding: 'player',
  standingOn: 'player',
  button: 'player',
  heldBy: 'thing',
  hidden: 'handle',
  moving: 'mover',
  has: 'zone',
  inside: 'zone',
}

const READ = new RegExp(`\\.\\s*(${Object.keys(READS).join('|')})\\b`, 'g')
/** What comes before a condition; an arrow's body as the guard writes it is `=> (__g(), (body))`. */
const BEFORE = /(?:\bif\s*\(|\bwhile\s*\(|!|&&|\|\||=>(?:\s*\(\s*__g\(\)\s*,\s*\()?)\s*$/
const AFTER = /^\s*(?:&&|\|\||\?(?!\.))/
const NAME = /[\w$]/

/** Where the chain of reads and calls that ends at `i` (a dot) begins: back over names, dots, and calls and indexes in brackets. */
function chainStart(text: string, i: number): number {
  let j = i
  for (;;) {
    while (j > 0 && /\s/.test(text[j - 1])) j--
    const c = text[j - 1]
    if (c === ')' || c === ']') {
      const open = c === ')' ? '(' : '['
      let depth = 0
      while (j > 0) {
        j--
        if (text[j] === c) depth++
        else if (text[j] === open && --depth === 0) break
      }
      // A call or an index hangs on what is before it.
      continue
    } else if (c !== undefined && NAME.test(c)) {
      while (j > 0 && NAME.test(text[j - 1])) j--
    } else return j
    let k = j
    while (k > 0 && /\s/.test(text[k - 1])) k--
    if (text[k - 1] !== '.') return j
    j = k - 1
  }
}

/** Whether the object literal around offset `i` is an argument of a builder call (`r.thing(..., { ... })`), short of a function's or a statement's block. */
function inBuilderCall(text: string, i: number): boolean {
  let depth = 0
  for (let j = i; j >= 0; j--) {
    const c = text[j]
    if (c === ')' || c === ']' || c === '}') depth++
    else if (c === '(' || c === '[' || c === '{') {
      if (depth > 0) depth--
      else if (c === '(') return /\br\s*\.\s*[\w$]+\s*$/.test(text.slice(Math.max(0, j - 40), j))
      else if (c === '{' && /(?:=>|\))\s*$/.test(text.slice(Math.max(0, j - 4), j))) return false
    }
  }
  return false
}

/**
 * The sentences for every read used as a condition without its call in made code's text: the body
 * as written, or as guarded (the guard keeps the lines, under a header line of its own: `headerLines`
 * is 1 then, 0 for a bare body). `where` names the code, as "the room's code".
 */
export function scanReads(text: string, where: string, headerLines: number): string[] {
  const out: string[] = []
  // Keys the code writes itself, as an object's key (also shorthand) or by assignment: its own objects have them. A builder's own option (`{ hidden: true }` in an r. call) is not one.
  const own = new Set(
    Object.keys(READS).filter((key) => {
      if (new RegExp(`\\.\\s*${key}\\s*=(?!=)`).test(text)) return true
      return [...text.matchAll(new RegExp(`[{,]\\s*${key}\\s*[:,}]`, 'g'))].some((k) => key !== 'hidden' || !inBuilderCall(text, k.index))
    }),
  )
  for (const m of text.matchAll(READ)) {
    if (own.has(m[1])) continue
    const after = text.slice(m.index + m[0].length)
    if (/^\s*(?:\(|\?\.\s*\(|=(?!=))/.test(after)) continue
    const start = chainStart(text, m.index)
    const before = text.slice(Math.max(0, start - 24), start)
    if (!BEFORE.test(before) && !AFTER.test(after)) continue
    // The code's own object, built as `name = {`, may have a key of the same name.
    const owner = /^[A-Za-z_$][\w$]*/.exec(text.slice(start, m.index))
    if (owner !== null && owner[0].length === m.index - start && new RegExp(`\\b${owner[0].replace(/\$/g, '\\$')}\\s*=\\s*\\{`).test(text)) continue
    const line = text.slice(0, m.index).split('\n').length - headerLines
    out.push(`${where}: ${MISTAKES.notCalled(READS[m[1]], m[1])} (line ${line})`)
  }
  return out
}
