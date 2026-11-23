/**
 * The library a commit ships (silly-billy/library/, which brain/shipped.ts bundles into the
 * build as it is). The tests run before the build, on the laptop and in the image, so this reads
 * the library the way the dev server does: a file whose guarded code an older guard made is
 * written back as today's guard makes it, an action or a thing from before the game had two
 * languages gets its Finnish name, and phrases from then (no Finnish line) leave phrases.json,
 * so a change needs no visit to the dev server before a push, and the refreshed files belong in
 * the same commit. A file the dev server would leave out (code the guard now refuses, a broken
 * entry) fails here, so it never plays on the hosted page. In a checkout with nothing made yet
 * the folder is empty or missing: this passes.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { ActionEntry, ItemEntry, PhraseEntry } from '../engine/protocol'
import { CODE_KINDS, type CodeKind } from './codeKinds'
import { guard } from './guard'
import { Store } from './store'

const LIBRARY = fileURLToPath(new URL('../../library/', import.meta.url))

/** phrases.json, by its path from the library, as text; nothing when there is none. */
function phrasesFile(): Map<string, string> {
  const file = path.join(LIBRARY, 'phrases.json')
  return fs.existsSync(file) ? new Map([['phrases.json', fs.readFileSync(file, 'utf8')]]) : new Map()
}

/** Each JSON file in a folder of the library, by its path from the library, as text. */
function files(folder: string): Map<string, string> {
  const dir = path.join(LIBRARY, folder)
  if (!fs.existsSync(dir)) return new Map()
  return new Map(
    fs
      .readdirSync(dir)
      .filter((n) => n.endsWith('.json'))
      .sort()
      .map((n) => [`${folder}/${n}`, fs.readFileSync(path.join(dir, n), 'utf8')]),
  )
}

function expectGuarded(file: string, kind: CodeKind, code: string, guarded: string | null) {
  const g = guard(CODE_KINDS[kind], code)
  expect(g.ok ? null : g.error, `${file}: the guard refuses its ${kind} code`).toBe(null)
  expect(guarded === (g.ok ? g.guarded : null), `${file}: its ${kind} code is not as today's guard makes it`).toBe(true)
}

describe('the library the build ships', () => {
  it("is brought up to date the way the dev server does it, and holds nothing it would leave out", () => {
    const before = new Map([...files('actions'), ...files('items'), ...phrasesFile()])
    const warnings: string[] = []
    new Store(LIBRARY, (m) => warnings.push(m)).read()
    expect(warnings).toEqual([])
    const after = new Map([...files('actions'), ...files('items'), ...phrasesFile()])
    const refreshed = [...after].filter(([file, text]) => before.get(file) !== text).map(([file]) => file)
    if (refreshed.length > 0) console.info(`silly-billy/library: brought up to date, commit these too: ${refreshed.join(', ')}`)
    for (const [file, text] of after) {
      if (file === 'phrases.json') {
        for (const p of JSON.parse(text) as PhraseEntry[]) expect(typeof p.plan.heardFi === 'string' && p.plan.heardFi.trim() !== '', `${file}: ${JSON.stringify(p.words)} has no line in Finnish`).toBe(true)
        continue
      }
      const e = JSON.parse(text) as ActionEntry | ItemEntry
      expect(typeof e.nameFi === 'string' && e.nameFi.trim() !== '', `${file}: no Finnish name`).toBe(true)
      if (e.type === 'action') expectGuarded(file, 'action', e.code, e.guarded)
      else {
        if (e.code !== null) expectGuarded(file, 'model', e.code, e.guarded)
        if (e.tick !== null) expectGuarded(file, 'tick', e.tick, e.tickGuarded)
      }
    }
  })
})
