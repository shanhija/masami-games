/**
 * Silly Billy's Claude (silly-billy/src/server/claude.ts), used as it is, with one thing more for
 * Magic House's log: what each answer cost. The CLI's last event, the result, carries the tokens
 * and the dollars, and Silly Billy's Answer keeps only the data and the time; so this reads the
 * result event a second time from the same process's output, for the call whose Spec asked to be
 * metered. Each call gets a Spec object of its own (metered), and spawn knows the call by it.
 */

import type { ChildProcess } from 'node:child_process'

import { Claude, type Spec } from '../../../silly-billy/src/server/claude'

/** What one answer cost, as the CLI's result event says it. */
export interface Usage {
  readonly inputTokens: number
  readonly outputTokens: number
  /** Of the output, the thinking. */
  readonly thinkingTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  readonly costUsd: number
}

/** The cost in a result event; null when it says none (the fake CLI's). */
export function usageOf(event: Record<string, unknown>): Usage | null {
  const u = event.usage as Record<string, unknown> | undefined
  if (typeof u !== 'object' || u === null || typeof event.total_cost_usd !== 'number') return null
  const n = (v: unknown) => (typeof v === 'number' ? v : 0)
  return {
    inputTokens: n(u.input_tokens),
    outputTokens: n(u.output_tokens),
    thinkingTokens: n((u.output_tokens_details as Record<string, unknown> | undefined)?.thinking_tokens),
    cacheReadTokens: n(u.cache_read_input_tokens),
    cacheWriteTokens: n(u.cache_creation_input_tokens),
    costUsd: event.total_cost_usd,
  }
}

export class MeteredClaude extends Claude {
  private readonly meters = new WeakMap<Spec, (usage: Usage | null) => void>()

  /** A Spec of its own for one call: every process spawned for it tells `meter` what its answer cost. */
  metered(spec: Spec, meter: (usage: Usage | null) => void): Spec {
    const own = { ...spec }
    this.meters.set(own, meter)
    return own
  }

  override spawn(spec: Spec): ChildProcess {
    const child = super.spawn(spec)
    const meter = this.meters.get(spec)
    if (meter === undefined) return child
    let buf = ''
    child.stdout!.on('data', (chunk: string | Buffer) => {
      buf += String(chunk)
      for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
        const line = buf.slice(0, i)
        buf = buf.slice(i + 1)
        if (!line.includes('"result"')) continue
        let event: Record<string, unknown>
        try {
          event = JSON.parse(line) as Record<string, unknown>
        } catch {
          continue // not an event: the CLI's own chatter, which the Session skips too
        }
        if (event.type === 'result') meter(usageOf(event))
      }
    })
    return child
  }
}
