// A stand-in for the Claude Code CLI in tests: reads stream-json user messages from stdin and
// answers each with the events the real CLI prints (stream deltas, then a result with the
// structured output). What it answers comes from the JSON file in FAKE_CLAUDE_ANSWERS, read on
// every turn (a test may rewrite it between turns), by the schema the process was started with
// (--json-schema):
//   byProperty     { "<property>": <answer>, ... } for any game's schemas: the first property, in
//                  the file's order, that is among the schema's properties gives the answer as it
//                  is. List an answer's own property before one it shares with another schema
//                  (a whole room's own field before the field a fix of that room also has). A
//                  list gives its answers in turn, one a turn across processes (the count in
//                  FAKE_CLAUDE_STATE.<property>), and its last again once they run out.
//   Silly Billy's own, when byProperty names none of the schema's properties:
//   plan           the interpreter's answer, for a schema with `heard`
//   code, bad      the designer's code, for a schema with `code`: { code } for an action's design;
//   tick, nameFi   a thing's design (a schema with `tick`) carries tick and nameFi too when they
//                  are given, as a model may add an optional field unasked
// A schema that nothing here answers gets an error result naming its properties.
// Words in the prompt steer it, for every schema:
//   HANG          never answers          CRASH        exits mid-turn
//   FAIL_ONCE     the first such turn ends in error_max_structured_output_retries (state in FAKE_CLAUDE_STATE)
//   TEXT_JSON     the answer only as JSON text in fences, no structured output
// and Silly Billy's own answers:
//   BAD_SYNTAX    the designer answers `bad` until the prompt carries a SyntaxError to fix
//   ALWAYS_BAD    the designer always answers `bad`
//   BROKEN_ONCE   the first such plan has tool-call markup in its heard (state in FAKE_CLAUDE_STATE.broken); ALWAYS_BROKEN every time
//   SHAPELESS_ONCE  the first such plan has no steps or new things at all (state in FAKE_CLAUDE_STATE.shapeless)
// Each turn is logged to FAKE_CLAUDE_LOG as a JSON line: { pid, turn, argv, cwd, prompt }, argv
// as the server passed it (--model, --effort, --system-prompt, --json-schema...).
import fs from 'node:fs'
import readline from 'node:readline'

const argv = process.argv.slice(2)
const arg = (name) => argv[argv.indexOf(name) + 1]
const schema = JSON.parse(arg('--json-schema'))
const properties = Object.keys(schema.properties ?? {})
const out = (e) => process.stdout.write(`${JSON.stringify(e)}\n`)
let turn = 0

out({ type: 'system', subtype: 'init', model: arg('--model'), tools: ['StructuredOutput'] })
process.stderr.write('fake claude ready\n')

/** The answer for this turn, or undefined when nothing in the answers file answers this schema. */
function answerFor(prompt) {
  const answers = JSON.parse(fs.readFileSync(process.env.FAKE_CLAUDE_ANSWERS, 'utf8'))
  const by = Object.keys(answers.byProperty ?? {}).find((p) => properties.includes(p))
  if (by !== undefined) {
    const answer = answers.byProperty[by]
    if (!Array.isArray(answer)) return answer
    if (!process.env.FAKE_CLAUDE_STATE) throw new Error('answers in turn need FAKE_CLAUDE_STATE')
    const count = `${process.env.FAKE_CLAUDE_STATE}.${by}`
    const n = fs.existsSync(count) ? Number(fs.readFileSync(count, 'utf8')) : 0
    fs.writeFileSync(count, String(n + 1))
    return answer[Math.min(n, answer.length - 1)]
  }
  const brokenOnce = `${process.env.FAKE_CLAUDE_STATE}.broken`
  const broken = prompt.includes('ALWAYS_BROKEN') || (prompt.includes('BROKEN_ONCE') && !fs.existsSync(brokenOnce))
  if (prompt.includes('BROKEN_ONCE')) fs.writeFileSync(brokenOnce, 'broken once')
  if (properties.includes('heard')) {
    if (broken) return { ...answers.plan, who: [], heard: `${answers.plan.heard}</heard>\n<parameter name="create">{"id": "ella"}` }
    const shapeless = `${process.env.FAKE_CLAUDE_STATE}.shapeless`
    if (prompt.includes('SHAPELESS_ONCE') && !fs.existsSync(shapeless)) {
      fs.writeFileSync(shapeless, 'shapeless once')
      return { heard: answers.plan.heard, say: 'Hmm?', sayFi: 'Hmm?' }
    }
    return answers.plan
  }
  if (properties.includes('code')) {
    const bad = prompt.includes('ALWAYS_BAD') || (prompt.includes('BAD_SYNTAX') && !prompt.includes('SyntaxError'))
    const code = bad ? answers.bad : answers.code
    if (!properties.includes('tick')) return { code }
    return { code, ...(answers.tick ? { tick: answers.tick } : {}), ...(answers.nameFi ? { nameFi: answers.nameFi } : {}) }
  }
  return undefined
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const prompt = JSON.parse(line).message.content
  turn++
  if (process.env.FAKE_CLAUDE_LOG) fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, `${JSON.stringify({ pid: process.pid, turn, argv, cwd: process.cwd(), prompt })}\n`)
  if (prompt.includes('HANG')) return
  if (prompt.includes('CRASH')) process.exit(3)
  if (prompt.includes('FAIL_ONCE') && !fs.existsSync(process.env.FAKE_CLAUDE_STATE)) {
    fs.writeFileSync(process.env.FAKE_CLAUDE_STATE, 'failed once')
    return out({ type: 'result', subtype: 'error_max_structured_output_retries', is_error: true, result: '' })
  }
  const data = answerFor(prompt)
  if (data === undefined) return out({ type: 'result', subtype: 'error_during_execution', is_error: true, result: `the fake CLI has no answer for a schema with ${properties.join(', ') || 'no properties'}` })
  const json = JSON.stringify(data)
  out({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', name: 'StructuredOutput', input: {} } } })
  for (let i = 0; i < json.length; i += 16) out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: json.slice(i, i + 16) } } })
  process.stdout.write('not json: the CLI sometimes says other things\n')
  if (prompt.includes('TEXT_JSON')) out({ type: 'result', subtype: 'success', is_error: false, result: `\`\`\`json\n${json}\n\`\`\`` })
  else out({ type: 'result', subtype: 'success', is_error: false, result: json, structured_output: data })
})
