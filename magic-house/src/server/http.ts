/**
 * What Magic House's server does with what comes in: a request's body and its failures, and the
 * checks of a shape that the API, the line and the store share. Silly Billy's api.ts has the
 * same few lines module-private (HttpError, readBody, readJson); sharing them by import needs them
 * exported there, a change to Silly Billy this step did not own, so these stand until it is made.
 */

import type { IncomingMessage } from 'node:http'

import type { Words } from '../../../profiles/src/lang'
import type { Paint, Shell } from '../engine/api'
import { PATTERN_ORDER } from '../patterns/patterns'

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
export const isText = (v: unknown): v is string => typeof v === 'string'
/** Words in both languages, as any text: what Opus wrote or a file holds. */
export const isWords = (v: unknown): v is Words => isObject(v) && isText(v.en) && isText(v.fi)
/** A surface of a room's shell as an answer or a file gives it: two colours as text (the build checks them as colours) and a pattern of the game's set. */
const isPaint = (v: unknown): v is Paint => isObject(v) && isText(v.color) && isText(v.second) && (PATTERN_ORDER as readonly unknown[]).includes(v.pattern)
/** A room's shell (engine/api.ts Shell) as an answer or a file gives it: three paints, a trim colour and a light as a number (the build takes it into LIGHT_RANGE). */
export const isShell = (v: unknown): v is Shell => isObject(v) && isPaint(v.walls) && isPaint(v.floor) && isPaint(v.ceiling) && isText(v.trim) && typeof v.light === 'number'
/** The longest a name a page sends may be in either language. */
const NAME_MOST = 80
/** A room's name as a page sends it back: both languages written, and short. */
export const isName = (v: unknown): v is Words => isWords(v) && v.en.trim() !== '' && v.fi.trim() !== '' && v.en.length <= NAME_MOST && v.fi.length <= NAME_MOST

/** A failure the page is answered with: its HTTP status and a sentence. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/** The most a body may be: a trial report with its survey is a few tens of kilobytes. */
const BODY_LIMIT = 2_000_000

/** The body as a JSON object; a 413 past the limit, a 400 when it is not a JSON object. */
export async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  // Past the limit the rest is read and dropped, so the refusal still reaches the page.
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size <= BODY_LIMIT) chunks.push(chunk)
  }
  if (size > BODY_LIMIT) throw new HttpError(413, `the request is over ${BODY_LIMIT} bytes`)
  let data: unknown
  try {
    data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'the body is not JSON')
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new HttpError(400, 'the body is not a JSON object')
  return data as Record<string, unknown>
}
