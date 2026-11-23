/**
 * The CLI driver against a fake CLI (test/fake-claude.mjs) that prints the real CLI's
 * stream-json events: one-shot answers with streamed progress, sessions that keep their
 * process, pools that spread the work, and every way a call can go wrong.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { Claude, Pool, Session, findClaude, once, type AskOpts, type Spec } from './claude'
import { ACTION_SCHEMA, PLAN_SCHEMA } from './prompts'
import { alive, fakeBin, until } from './test/fakes'

interface Call {
  pid: number
  turn: number
  argv: string[]
  cwd: string
  prompt: string
}

const CODE = 'yield* me.jump()\nme.say("Hop!")'
const PLAN = { heard: 'Aino jumps', heardFi: 'Aino hyppää', who: ['alice'], steps: [{ who: 'alice', action: 'jump', args: [] }], newActions: [], newItems: [], say: 'Hop!', sayFi: 'Hyppy!' }

let dir: string
let claude: Claude
const logs: string[] = []
const calls = (): Call[] => (fs.existsSync(process.env.FAKE_CLAUDE_LOG!) ? fs.readFileSync(process.env.FAKE_CLAUDE_LOG!, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Call) : [])
const spec = (schema: Record<string, unknown>): Spec => ({ model: 'haiku', effort: 'low', system: 'You are a test.', schema })
const opts = (more: Partial<AskOpts> = {}): AskOpts => ({ timeoutMs: 5000, onText: null, signal: null, ...more })

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silly-billy-claude-test-'))
  process.env.FAKE_CLAUDE_ANSWERS = path.join(dir, 'answers.json')
  process.env.FAKE_CLAUDE_LOG = path.join(dir, 'calls.jsonl')
  process.env.FAKE_CLAUDE_STATE = path.join(dir, 'failed-once')
  fs.writeFileSync(process.env.FAKE_CLAUDE_ANSWERS, JSON.stringify({ plan: PLAN, code: CODE, bad: 'const = 1' }))
  claude = new Claude(fakeBin(dir, 'fake-claude.mjs'), (m) => logs.push(m))
})
afterEach(() => {
  claude.close()
  fs.rmSync(process.env.FAKE_CLAUDE_LOG!, { force: true })
})
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('findClaude', () => {
  it('looks in CLAUDE_BIN, the PATH, the desktop app and the VS Code extension, newest first', () => {
    const home = path.join(dir, 'home')
    const put = (...parts: string[]) => {
      const file = path.join(home, ...parts)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, '')
      return file
    }
    const ext = (v: string) => put('.vscode', 'extensions', `anthropic.claude-code-${v}-linux-x64`, 'resources', 'native-binary', 'claude')
    expect(findClaude({ PATH: '' }, home)).toBeNull()
    ext('2.1.2')
    const newestExt = ext('2.1.11')
    expect(findClaude({ PATH: '' }, home)).toBe(newestExt)
    put('.config', 'Claude', 'claude-code', '2.1.9', 'aaaa', 'claude')
    const desktop = put('.config', 'Claude', 'claude-code', '2.1.10', 'bbbb', 'claude')
    expect(findClaude({ PATH: '' }, home)).toBe(desktop)
    const onPath = put('bin', 'claude')
    expect(findClaude({ PATH: ['/nowhere', path.dirname(onPath)].join(path.delimiter) }, home)).toBe(onPath)
    expect(findClaude({ PATH: path.dirname(onPath), CLAUDE_BIN: newestExt }, home)).toBe(newestExt)
    expect(findClaude({ PATH: '', CLAUDE_BIN: '/no/such/claude' }, home)).toBe(desktop)
  })
})

describe('once', () => {
  it('answers with the structured output, streaming the reply as it comes', async () => {
    const texts: string[] = []
    const answer = await once(claude, spec(ACTION_SCHEMA), 'Make a hop.', opts({ onText: (t) => texts.push(t) }))
    expect(answer.data).toEqual({ code: CODE })
    expect(answer.ms).toBeGreaterThanOrEqual(0)
    expect(texts.length).toBeGreaterThan(1)
    expect(texts.at(-1)).toBe(JSON.stringify({ code: CODE }))
    const [call] = calls()
    expect(call!.prompt).toBe('Make a hop.')
    expect(call!.argv).toEqual([
      '-p', '--model', 'haiku', '--tools', '', '--strict-mcp-config', '--setting-sources', 'project', '--no-session-persistence',
      '--system-prompt', 'You are a test.', '--json-schema', JSON.stringify(ACTION_SCHEMA), '--effort', 'low',
      '--output-format', 'stream-json', '--input-format', 'stream-json', '--verbose', '--include-partial-messages',
    ])
    // An empty folder of its own, so no CLAUDE.md or settings reach the model.
    expect(call!.cwd.startsWith(os.tmpdir())).toBe(true)
    expect(fs.readdirSync(call!.cwd)).toEqual([])
    await until(() => !alive(call!.pid), 2000, 'the process to end')
  })

  it('reads the JSON from the text when there is no structured output', async () => {
    expect((await once(claude, spec(PLAN_SCHEMA), 'TEXT_JSON', opts())).data).toEqual(PLAN)
  })

  it('asks once more when the CLI gave up fitting the schema', async () => {
    fs.rmSync(process.env.FAKE_CLAUDE_STATE!, { force: true })
    expect((await once(claude, spec(ACTION_SCHEMA), 'FAIL_ONCE', opts())).data).toEqual({ code: CODE })
    const [first, second] = calls()
    expect(first!.pid).not.toBe(second!.pid)
    expect(logs).toContain('the CLI gave up fitting the schema: asking once more')
  })

  it('times out and kills the process', async () => {
    await expect(once(claude, spec(ACTION_SCHEMA), 'HANG', opts({ timeoutMs: 2000 }))).rejects.toThrow('timed out after 2 s')
    await until(() => !alive(calls()[0]!.pid), 2000, 'the hung process to be killed')
  })

  it('stops when aborted', async () => {
    const abort = new AbortController()
    const asked = once(claude, spec(ACTION_SCHEMA), 'HANG', opts({ signal: abort.signal }))
    await until(() => calls().length === 1, 5000, 'the hung turn to start')
    abort.abort()
    await expect(asked).rejects.toThrow('aborted')
    await until(() => !alive(calls()[0]!.pid), 2000, 'the aborted process to be killed')
    const aborted = new AbortController()
    aborted.abort()
    await expect(once(claude, spec(ACTION_SCHEMA), 'Hop.', opts({ signal: aborted.signal }))).rejects.toThrow('aborted')
  })

  it('fails with what the CLI said when it exits mid-turn', async () => {
    await expect(once(claude, spec(ACTION_SCHEMA), 'CRASH', opts())).rejects.toThrow(/the CLI exited \(3\): fake claude ready/)
  })

  it('fails when the CLI cannot start', async () => {
    const missing = new Claude(path.join(dir, 'no-such-claude'), () => {})
    await expect(once(missing, spec(ACTION_SCHEMA), 'Hop.', opts())).rejects.toThrow(/the CLI failed to start/)
    missing.close()
  })

  it('thinks as hard as its spec asks', async () => {
    await once(claude, { ...spec(ACTION_SCHEMA), effort: 'max' }, 'Make a hop.', opts())
    const [call] = calls()
    expect(call!.argv.slice(call!.argv.indexOf('--effort'), call!.argv.indexOf('--effort') + 2)).toEqual(['--effort', 'max'])
  })
})

describe('the fake CLI', () => {
  const object = (properties: string[]) => ({ type: 'object', properties: Object.fromEntries(properties.map((p) => [p, { type: 'string' }])), required: properties })

  it("answers any game's schema by the first of its properties the answers file names, and says when nothing does", async () => {
    const room = { place: 'a kitchen', room: 'r.box(1, 1)', walk: 'yield* bots[0].goTo(w.exit)' }
    const fix = { room: 'r.box(2, 1)' }
    const gift = { gift: 'm.box(1, 1, 1)' }
    fs.writeFileSync(process.env.FAKE_CLAUDE_ANSWERS!, JSON.stringify({ byProperty: { place: room, room: fix, gift } }))
    try {
      expect((await once(claude, spec(object(['place', 'room', 'walk'])), 'Build a room.', opts())).data).toEqual(room)
      expect((await once(claude, spec(object(['room'])), 'Mend the room.', opts())).data).toEqual(fix)
      expect((await once(claude, spec(object(['about', 'gift'])), 'Make a present.', opts())).data).toEqual(gift)
      await expect(once(claude, spec(object(['quiz'])), 'Ask a sum.', opts())).rejects.toThrow('the fake CLI has no answer for a schema with quiz')
      // A list answers in turn, across processes, and then keeps its last.
      fs.rmSync(`${process.env.FAKE_CLAUDE_STATE}.room`, { force: true })
      fs.writeFileSync(process.env.FAKE_CLAUDE_ANSWERS!, JSON.stringify({ byProperty: { room: [{ room: 'const = 1' }, fix] } }))
      const turns: unknown[] = []
      for (let i = 0; i < 3; i++) turns.push((await once(claude, spec(object(['room'])), 'Mend the room.', opts())).data)
      expect(turns).toEqual([{ room: 'const = 1' }, fix, fix])
    } finally {
      fs.writeFileSync(process.env.FAKE_CLAUDE_ANSWERS!, JSON.stringify({ plan: PLAN, code: CODE, bad: 'const = 1' }))
    }
  })
})

describe('Session', () => {
  it('keeps one process, one turn at a time, and starts afresh after maxTurns', async () => {
    const session = new Session(claude, spec(PLAN_SCHEMA), 3)
    const answers = await Promise.all([1, 2, 3, 4].map((n) => session.ask(`turn ${n}`, opts())))
    expect(answers.map((a) => a.data)).toEqual([PLAN, PLAN, PLAN, PLAN])
    const log = calls()
    expect(log.map((c) => c.prompt)).toEqual(['turn 1', 'turn 2', 'turn 3', 'turn 4'])
    expect(log.map((c) => c.turn)).toEqual([1, 2, 3, 1])
    expect(new Set(log.slice(0, 3).map((c) => c.pid)).size).toBe(1)
    expect(log[3]!.pid).not.toBe(log[0]!.pid)
    session.close()
  })

  it('starts afresh after an error and keeps answering', async () => {
    const session = new Session(claude, spec(PLAN_SCHEMA), 12)
    await session.ask('first', opts())
    await expect(session.ask('CRASH', opts())).rejects.toThrow(/exited/)
    await expect(session.ask('HANG', opts({ timeoutMs: 1500 }))).rejects.toThrow(/timed out/)
    expect((await session.ask('after', opts())).data).toEqual(PLAN)
    const pids = calls().map((c) => c.pid)
    expect(new Set(pids).size).toBe(3)
    session.close()
  })

  it('starts its process ahead of the first turn', async () => {
    const session = new Session(claude, spec(PLAN_SCHEMA), 12)
    session.start()
    session.start()
    await session.ask('warm', opts())
    expect(calls()[0]!.turn).toBe(1)
    session.close()
  })
})

describe('Pool', () => {
  it('starts a fresh process at once after each one-turn answer', async () => {
    const pool = new Pool(claude, spec(PLAN_SCHEMA), 1, 1)
    await pool.ask('one', opts())
    await until(() => calls().length === 1, 2000, 'the first call')
    // The next process is up before the next ask: it answers on its first turn, with a new pid.
    await new Promise((r) => setTimeout(r, 300))
    await pool.ask('two', opts())
    const [first, second] = calls()
    expect([first!.turn, second!.turn]).toEqual([1, 1])
    expect(second!.pid).not.toBe(first!.pid)
    pool.close()
  })

  it('sends asks at the same time to different sessions', async () => {
    const pool = new Pool(claude, spec(PLAN_SCHEMA), 2, 12)
    await Promise.all([pool.ask('one', opts()), pool.ask('two', opts())])
    await Promise.all([pool.ask('three', opts()), pool.ask('four', opts())])
    const log = calls()
    expect(new Set(log.map((c) => c.pid)).size).toBe(2)
    expect(log.map((c) => c.turn).sort()).toEqual([1, 1, 2, 2])
    pool.close()
  })
})
