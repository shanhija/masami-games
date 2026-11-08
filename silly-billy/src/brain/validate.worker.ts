/** The validation worker: one request in, one answer out; the page terminates it afterwards (brain/validate.ts). */

import './workerWindow'
import { validate, type ValidateRequest } from './validate'

self.onmessage = (e: MessageEvent<ValidateRequest>) => {
  self.postMessage(validate(e.data))
}
