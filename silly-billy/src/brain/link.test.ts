/** The link to the dev server against a fake fetch: status and being offline, errors, and the designer's NDJSON stream cut anywhere. */
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ActionEntry, Status } from '../engine/protocol'
import { createLink } from './link'

const STATUS: Status = { claude: true, whisper: 'ready', models: { interpret: 'haiku', invent: 'opus' } }
const ENTRY: ActionEntry = {
  type: 'action',
  id: 'throw',
  name: 'throw',
  nameFi: 'heitä',
  calls: ['heitä'],
  about: 'throws it',
  params: [],
  code: 'yield',
  guarded: 'function* (me, args, w) { yield }',
  by: 'opus',
  asked: 'heitä',
  made: '2026-11-08T00:00:00.000Z',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** A streamed reply arriving in these pieces. */
const stream = (pieces: string[]) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const p of pieces) c.enqueue(new TextEncoder().encode(p))
        c.close()
      },
    }),
  )

function serve(answer: (url: string, init: RequestInit | undefined) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return answer(url, init)
    }),
  )
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('status', () => {
  it('is online when the server has Claude', async () => {
    serve(() => json(STATUS))
    const link = createLink()
    expect(link.online).toBe(false)
    expect(await link.status()).toEqual(STATUS)
    expect(link.online).toBe(true)
  })

  it('is offline without Claude, without a server, or with a page that is not ours', async () => {
    const link = createLink()
    serve(() => json({ ...STATUS, claude: false }))
    expect((await link.status())!.claude).toBe(false)
    expect(link.online).toBe(false)
    serve(() => json(STATUS))
    await link.status()
    serve(() => {
      throw new TypeError('Failed to fetch')
    })
    expect(await link.status()).toBeNull()
    expect(link.online).toBe(false)
    serve(() => new Response('<html>not found</html>', { status: 404 }))
    expect(await link.status()).toBeNull()
    serve(() => new Response('<html>the directory</html>', { status: 200 }))
    expect(await link.status()).toBeNull()
  })

  it('in the build asks nothing: a build has no server, and asking would leave a 404 in the console', async () => {
    const calls = serve(() => json(STATUS))
    vi.stubEnv('PROD', true)
    const link = createLink()
    expect(await link.status()).toBeNull()
    expect(link.online).toBe(false)
    expect(calls).toHaveLength(0)
  })
})

describe('asking', () => {
  it('posts JSON to the endpoint beside the page', async () => {
    const calls = serve(() => json({ plan: { heard: 'x' }, ms: 3 }))
    const reply = await createLink().interpret({ words: 'alice hyppää', lang: 'fi', context: 'Room: pool' })
    expect(reply.ms).toBe(3)
    expect(calls[0]!.url).toBe('./api/interpret')
    expect(calls[0]!.init!.method).toBe('POST')
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ words: 'alice hyppää', lang: 'fi', context: 'Room: pool' })
  })

  it("rejects with the server's error", async () => {
    serve(() => json({ error: 'the interpreter timed out' }, 504))
    await expect(createLink().interpret({ words: 'x', lang: 'fi', context: 'c' })).rejects.toThrow('the interpreter timed out')
    serve(() => new Response('', { status: 502, statusText: 'Bad Gateway' }))
    await expect(createLink().save({ entry: ENTRY })).rejects.toThrow('502 Bad Gateway')
  })

  it('sends the sound to hear with the language and the prime, partial asks marked', async () => {
    const calls = serve(() => json({ text: 'aino hyppää', ms: 400 }))
    const link = createLink('/silly-billy/api/')
    expect((await link.hear(new ArrayBuffer(8), 'fi', true, 'Aino ja Eetu leikkivät. Aino, hyppää!')).text).toBe('aino hyppää')
    await link.hear(new ArrayBuffer(8), 'en', false, 'Alice & Nora are playing.')
    // No prime, or an empty one: the server picks its own for the language.
    await link.hear(new ArrayBuffer(8), 'en', false)
    await link.hear(new ArrayBuffer(8), 'fi', false, ' ')
    expect(calls.map((c) => c.url)).toEqual([
      '/silly-billy/api/hear?lang=fi&partial=1&prime=Aino+ja+Eetu+leikkiv%C3%A4t.+Aino%2C+hypp%C3%A4%C3%A4%21',
      '/silly-billy/api/hear?lang=en&prime=Alice+%26+Nora+are+playing.',
      '/silly-billy/api/hear?lang=en',
      '/silly-billy/api/hear?lang=fi',
    ])
    const sent = new URL(calls[0]!.url, 'http://localhost').searchParams
    expect([sent.get('lang'), sent.get('partial'), sent.get('prime')]).toEqual(['fi', '1', 'Aino ja Eetu leikkivät. Aino, hyppää!'])
  })

  it('reads the library from the server in development', async () => {
    const data = { items: [], actions: [ENTRY], avatars: [], phrases: [] }
    const calls = serve(() => json(data))
    expect(await createLink().library()).toEqual(data)
    expect(calls[0]!.url).toBe('./api/library')
  })

  it('logs without waiting and never throws', async () => {
    const calls = serve(() => {
      throw new TypeError('Failed to fetch')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    createLink().log({ kind: 'heard', words: 'seis' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls[0]!.url).toBe('./api/log')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('inventing', () => {
  it('reads progress and the entry from lines cut anywhere', async () => {
    const lines = `${JSON.stringify({ progress: 0.2 })}\n${JSON.stringify({ progress: 0.6 })}\n${JSON.stringify({ done: ENTRY, ms: 5200 })}\n`
    serve(() => stream([lines.slice(0, 7), lines.slice(7, 30), lines.slice(30, 31), lines.slice(31)]))
    const progress: number[] = []
    const made = await createLink().invent({ kind: 'action', spec: { id: 'throw', name: 'throw', nameFi: 'heitä', calls: [], about: 'x', params: [] }, words: 'heitä', context: 'c' }, (p) => progress.push(p))
    expect(made).toEqual(ENTRY)
    expect(progress).toEqual([0.2, 0.6])
  })

  it("rejects with the designer's error, and when the stream ends with no answer", async () => {
    const req = { kind: 'action' as const, spec: { id: 'throw', name: 'throw', nameFi: 'heitä', calls: [], about: 'x', params: [] }, words: 'heitä', context: 'c' }
    serve(() => stream([`${JSON.stringify({ progress: 0.3 })}\n${JSON.stringify({ error: 'SyntaxError: Unexpected token (line 3)' })}`]))
    await expect(createLink().invent(req, () => {})).rejects.toThrow('SyntaxError: Unexpected token (line 3)')
    serve(() => stream([`${JSON.stringify({ progress: 0.3 })}\n`]))
    await expect(createLink().invent(req, () => {})).rejects.toThrow('the designer stopped without an answer')
    serve(() => json({ error: 'Claude is not here' }, 503))
    await expect(createLink().invent(req, () => {})).rejects.toThrow('Claude is not here')
  })
})
