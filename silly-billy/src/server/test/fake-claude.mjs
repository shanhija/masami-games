// A stand-in for the Claude Code CLI in tests: reads stream-json user messages from stdin and
// answers each with the events the real CLI prints (stream deltas, then a result with the
// structured output). What it answers comes from the JSON file in FAKE_CLAUDE_ANSWERS, read on
// every turn: { plan, code, bad, tick, nameFi } (a thing's design carries tick and nameFi when they
// are given, as a model may add an optional field unasked). Words in the prompt steer it:
//   HANG          never answers          CRASH        exits mid-turn
//   FAIL_ONCE     the first such turn ends in error_max_structured_output_retries (state in FAKE_CLAUDE_STATE)
//   TEXT_JSON     the answer only as JSON text in fences, no structured output
//   BAD_SYNTAX    the designer answers `bad` until the prompt carries a SyntaxError to fix
//   ALWAYS_BAD    the designer always answers `bad`
//   BROKEN_ONCE   the first such plan has tool-call markup in its heard (state in FAKE_CLAUDE_STATE.broken); ALWAYS_BROKEN every time
//   SHAPELESS_ONCE  the first such plan has no steps or new things at all (state in FAKE_CLAUDE_STATE.shapeless)
// Each turn is logged to FAKE_CLAUDE_LOG as a JSON line: { pid, turn, argv, cwd, prompt }.
import fs from 'node:fs'
import readline from 'node:readline'

const argv = process.argv.slice(2)
const arg = (name) => argv[argv.indexOf(name) + 1]
const schema = JSON.parse(arg('--json-schema'))
const out = (e) => process.stdout.write(`${JSON.stringify(e)}\n`)
let turn = 0

out({ type: 'system', subtype: 'init', model: arg('--model'), tools: ['StructuredOutput'] })
process.stderr.write('fake claude ready\n')

function answerFor(prompt) {
  const answers = JSON.parse(fs.readFileSync(process.env.FAKE_CLAUDE_ANSWERS, 'utf8'))
  const brokenOnce = `${process.env.FAKE_CLAUDE_STATE}.broken`
  const broken = prompt.includes('ALWAYS_BROKEN') || (prompt.includes('BROKEN_ONCE') && !fs.existsSync(brokenOnce))
  if (prompt.includes('BROKEN_ONCE')) fs.writeFileSync(brokenOnce, 'broken once')
  if (schema.properties.heard && broken) return { ...answers.plan, who: [], heard: `${answers.plan.heard}</heard>\n<parameter name="create">{"id": "ella"}` }
  const shapeless = `${process.env.FAKE_CLAUDE_STATE}.shapeless`
  if (schema.properties.heard && prompt.includes('SHAPELESS_ONCE') && !fs.existsSync(shapeless)) {
    fs.writeFileSync(shapeless, 'shapeless once')
    return { heard: answers.plan.heard, say: 'Hmm?', sayFi: 'Hmm?' }
  }
  if (schema.properties.heard) return answers.plan
  const bad = prompt.includes('ALWAYS_BAD') || (prompt.includes('BAD_SYNTAX') && !prompt.includes('SyntaxError'))
  const code = bad ? answers.bad : answers.code
  if (!schema.properties.tick) return { code }
  return { code, ...(answers.tick ? { tick: answers.tick } : {}), ...(answers.nameFi ? { nameFi: answers.nameFi } : {}) }
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
  const json = JSON.stringify(data)
  out({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', name: 'StructuredOutput', input: {} } } })
  for (let i = 0; i < json.length; i += 16) out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: json.slice(i, i + 16) } } })
  process.stdout.write('not json: the CLI sometimes says other things\n')
  if (prompt.includes('TEXT_JSON')) out({ type: 'result', subtype: 'success', is_error: false, result: `\`\`\`json\n${json}\n\`\`\`` })
  else out({ type: 'result', subtype: 'success', is_error: false, result: json, structured_output: data })
})
