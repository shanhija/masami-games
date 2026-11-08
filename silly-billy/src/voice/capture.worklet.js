// Hands the microphone's samples to the page in small blocks, at the context's own rate (16 kHz
// where the browser allows it). Loaded by mic.ts through new URL(..., import.meta.url), so Vite
// ships it as it is.
class Capture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0][0]
    if (ch) this.port.postMessage(ch.slice(0))
    return true
  }
}
registerProcessor('capture', Capture)
