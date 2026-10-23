/** The camera both platformers share: Pia Jump's renderer and Super Me's (marienpeli/src/draw/frame.ts). */

/** Pia sits ANCHOR_RIGHT across the view while she heads right and ANCHOR_LEFT while she heads left. The camera turns only once she has moved the other way faster than TURN_SPEED (tiles/s) for TURN_AFTER, and eases round over TURN_EASE. */
const ANCHOR_RIGHT = 0.38
const ANCHOR_LEFT = 0.62
const TURN_SPEED = 2
const TURN_AFTER = 0.35
const TURN_EASE = 0.8
/** The follow is a critically damped spring of this angular frequency (1/s), never faster than CAMERA_MAX tiles/s. */
const CAMERA_OMEGA = 5
const CAMERA_MAX = 14
/** Behind the room cards the camera drifts right this fast (tiles/s) and starts over at the room's end. */
const DRIFT = 0.6

/** k of the way from a to b. */
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
/** x held between lo and hi. */
const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi)

/**
 * Where the view's left edge is, in tiles: a spring following Pia, with a look-ahead that
 * turns round only when she does for a while, so a child wiggling left and right does not
 * swing the picture.
 */
export class Camera {
  /** The view's left edge (tiles) and how fast it moves (tiles/s). */
  x = 0
  v = 0
  /** The way she is heading as far as the camera knows. */
  dir: -1 | 1 = 1
  /** Where Pia sits across the view (0 the left edge, 1 the right), easing toward the way she heads. */
  anchor = ANCHOR_RIGHT
  private from = ANCHOR_RIGHT
  /** Seconds since the camera last turned, and how long she has moved against `dir`. */
  private turned = TURN_EASE
  private against = 0

  /** Straight onto Pia at hx, heading right. */
  reset(hx: number, viewCols: number, cols: number): void {
    this.dir = 1
    this.anchor = this.from = ANCHOR_RIGHT
    this.turned = TURN_EASE
    this.against = 0
    this.v = 0
    this.x = clamp(hx - this.anchor * viewCols, 0, Math.max(0, cols - viewCols))
  }

  /** One frame of dt seconds following Pia at hx, moving `speed` tiles/s along x; `steering` while the child moves her (not the rescue bubble or the walk home), which is all that turns the camera. */
  follow(hx: number, speed: number, steering: boolean, dt: number, viewCols: number, cols: number): void {
    if (dt <= 0) return
    this.against = steering && speed * this.dir < -TURN_SPEED ? this.against + dt : 0
    if (this.against >= TURN_AFTER) {
      this.dir = this.dir > 0 ? -1 : 1
      this.from = this.anchor
      this.turned = 0
      this.against = 0
    }
    this.turned += dt
    const u = Math.min(1, this.turned / TURN_EASE)
    this.anchor = lerp(this.from, this.dir > 0 ? ANCHOR_RIGHT : ANCHOR_LEFT, u * u * (3 - 2 * u))
    const most = Math.max(0, cols - viewCols)
    const target = clamp(hx - this.anchor * viewCols, 0, most)
    // The exact step of a critically damped spring toward a target that holds still for dt.
    const off = this.x - target
    const pull = (this.v + CAMERA_OMEGA * off) * dt
    const decay = Math.exp(-CAMERA_OMEGA * dt)
    let x = target + (off + pull) * decay
    let v = (this.v - CAMERA_OMEGA * pull) * decay
    if (Math.abs(x - this.x) > CAMERA_MAX * dt) x = this.x + Math.sign(x - this.x) * CAMERA_MAX * dt
    if (Math.abs(v) > CAMERA_MAX) v = Math.sign(v) * CAMERA_MAX
    this.x = clamp(x, 0, most)
    this.v = v
  }

  /** One frame of drifting right behind the room cards, starting over at the room's end. */
  drift(dt: number, viewCols: number, cols: number): void {
    this.v = DRIFT
    this.x += DRIFT * dt
    if (this.x > Math.max(0, cols - viewCols)) this.x = 0
  }
}
