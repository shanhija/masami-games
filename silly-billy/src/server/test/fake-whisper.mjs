// A stand-in for whisper.cpp's whisper-server in tests: after FAKE_WHISPER_DELAY ms (loading
// the model) it listens on --port, answers GET / with its pid and POST /inference with the words
// in the file FAKE_WHISPER_TEXT_FILE names (read for each request, so a test can change them),
// else FAKE_WHISPER_TEXT, logging every form field it got (the clip as whether it is a WAV) to
// FAKE_WHISPER_LOG as a JSON line. Asked for verbose_json, the words come as one segment with a
// no-speech probability of 0.25 and a mean log probability of -0.5. With FAKE_WHISPER_EXTRAS it
// says in an X-Whisper-Extras header that it understands those fields, as Silly Billy's build
// does. Told to stop, it goes on answering for FAKE_WHISPER_STOP_DELAY ms first, as a real
// server freeing its memory might.
import fs from 'node:fs'
import http from 'node:http'

const argv = process.argv.slice(2)
const arg = (name) => argv[argv.indexOf(name) + 1]

/** The fields of a multipart/form-data body, by name; a file field as whether it starts as a WAV. */
function fields(body, type) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(type ?? '')
  if (!boundary) return {}
  const out = {}
  for (const part of body.split(`--${boundary[1] ?? boundary[2]}`)) {
    const head = /^\r\nContent-Disposition: form-data; name="([^"]+)"(; filename="[^"]*")?[^]*?\r\n\r\n/i.exec(part)
    if (!head) continue
    const value = part.slice(head[0].length).replace(/\r\n$/, '')
    out[head[1]] = head[2] ? { wav: value.startsWith('RIFF') } : value
  }
  return out
}

const words = () => (process.env.FAKE_WHISPER_TEXT_FILE && fs.existsSync(process.env.FAKE_WHISPER_TEXT_FILE) ? fs.readFileSync(process.env.FAKE_WHISPER_TEXT_FILE, 'utf8') : (process.env.FAKE_WHISPER_TEXT ?? ' Alice, hyppää! '))

setTimeout(() => {
  const server = http
    .createServer((req, res) => {
      if (process.env.FAKE_WHISPER_EXTRAS) res.setHeader('x-whisper-extras', process.env.FAKE_WHISPER_EXTRAS)
      if (req.method === 'GET') return res.end(`whisper ${process.pid}`)
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        const got = { model: arg('-m'), pid: process.pid, ...fields(Buffer.concat(chunks).toString('latin1'), req.headers['content-type']) }
        // Form fields come as UTF-8: read back as such once split.
        for (const [k, v] of Object.entries(got)) if (typeof v === 'string' && k !== 'model') got[k] = Buffer.from(v, 'latin1').toString('utf8')
        if (process.env.FAKE_WHISPER_LOG) fs.appendFileSync(process.env.FAKE_WHISPER_LOG, `${JSON.stringify(got)}\n`)
        res.setHeader('content-type', 'application/json')
        const text = words()
        res.end(JSON.stringify(got.response_format === 'verbose_json' ? { text, segments: [{ text, no_speech_prob: 0.25, avg_logprob: -0.5 }] } : { text }))
      })
    })
    .listen(Number(arg('--port')), '127.0.0.1')
  process.on('SIGTERM', () => {
    setTimeout(() => {
      server.close()
      process.exit(0)
    }, Number(process.env.FAKE_WHISPER_STOP_DELAY ?? 0))
  })
}, Number(process.env.FAKE_WHISPER_DELAY ?? 0))
