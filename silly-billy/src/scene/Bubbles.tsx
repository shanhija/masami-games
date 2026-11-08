import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { Vector3, type Group } from 'three'

import { headFrame, proportions } from '../engine/body'
import type { Actor } from '../engine/types'
import './bubbles.css'
import { declutter, type TagBox } from './declutter'
import { useLive } from './live'
import { colorOf, type Clock } from './look'
import type { SceneSource } from './Stage'

/**
 * What floats over an actor's head, drawn by the page over the canvas so it stays sharp and
 * the same size however far away the actor is: the name in a little tag of the actor's own
 * colour; the speech bubble with what it says; while it works something new out, a thought
 * cloud with two turning cogs that fills up as the designer writes; and while the
 * interpreter is still making sense of the words, an ear that listens. Everything sits
 * below the HUD (z-index 0 to 10). Blocks that would cover each other are moved apart
 * (declutter.ts), so two people standing close both show their names.
 */

const TAU = Math.PI * 2

/** A cog's outline: `teeth` flat teeth round a ring, with a hole in the middle (fill-rule evenodd). */
function cog(cx: number, cy: number, teeth: number, outer: number, inner: number, hole: number): string {
  const n = teeth * 4
  const points = Array.from({ length: n }, (_, i) => {
    const a = ((i + 0.5) / n) * TAU
    const r = i % 4 < 2 ? outer : inner
    return `${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`
  })
  return `M${points.join('L')}Z M${cx + hole},${cy} A${hole},${hole} 0 1 0 ${cx - hole},${cy} A${hole},${hole} 0 1 0 ${cx + hole},${cy}Z`
}

/** The cloud: overlapping puffs, and two little ones trailing down toward the head. */
const CLOUD: [number, number, number][] = [
  [22, 34, 15],
  [40, 22, 19],
  [61, 28, 16],
  [71, 41, 11],
  [50, 43, 14],
  [31, 45, 12],
]
const CLOUD_TOP = 3
const CLOUD_BOTTOM = 57
const BIG = { x: 38, y: 32, path: cog(38, 32, 9, 12, 9, 3.5) }
const SMALL = { x: 57, y: 37, path: cog(57, 37, 7, 8.5, 6.2, 2.5) }

/** An actor's block over its head as the declutter sees it: where it hangs, its element once drawn, and how far it has been moved. */
interface Tag {
  anchor: RefObject<Group>
  el: HTMLDivElement | null
  dx: number
  dy: number
  /** Where the declutter put it last frame, which it eases toward; null when it was not on the screen. */
  goal: [number, number] | null
  /** The move last written to the element. */
  shown: string
}

/** Every actor's block, by actor id. */
export type TagBoard = Map<string, Tag>

const at = new Vector3()

/**
 * Once a frame: every block on the screen, nearest first, moved apart where they would cover
 * each other, each remembering where it was put last frame. The moves ease in, so a block
 * slides to its new place instead of jumping.
 */
export function Declutter({ board }: { board: TagBoard }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  useFrame((_, delta) => {
    const shown: Array<{ tag: Tag; el: HTMLDivElement; depth: number; box: TagBox }> = []
    for (const tag of board.values()) {
      const g = tag.anchor.current
      if (tag.el === null || g === null) {
        tag.goal = null
        continue
      }
      g.getWorldPosition(at)
      const depth = at.distanceTo(camera.position)
      at.project(camera)
      // Behind the camera: drei hides it.
      if (at.z > 1) {
        tag.goal = null
        continue
      }
      shown.push({ tag, el: tag.el, depth, box: { x: ((at.x + 1) / 2) * size.width, y: ((1 - at.y) / 2) * size.height, w: tag.el.offsetWidth, h: tag.el.offsetHeight, was: tag.goal ?? undefined } })
    }
    shown.sort((a, b) => a.depth - b.depth)
    const moves = declutter(
      shown.map((s) => s.box),
      size.width,
    )
    const k = 1 - Math.exp(-12 * Math.min(delta, 0.1))
    shown.forEach(({ tag, el }, i) => {
      const [dx, dy] = moves[i]!
      tag.goal = [dx, dy]
      tag.dx += (dx - tag.dx) * k
      tag.dy += (dy - tag.dy) * k
      const move = `${tag.dx.toFixed(1)}px ${tag.dy.toFixed(1)}px`
      if (move === tag.shown) return
      tag.shown = move
      el.style.translate = move
    })
  })
  return null
}

/** What the bubbles show, as one string so React draws again only when it changes. */
function shown(a: Actor | undefined, t: number): string {
  if (a === undefined) return ''
  const say = a.bubble !== null && t < a.bubble.until ? a.bubble.text : ''
  return JSON.stringify([a.name, colorOf(a.look.top), say, a.thinking !== null, a.listening])
}

export function Bubbles({ source, id, clock, board }: { source: SceneSource; id: string; clock: Clock; board: TagBoard }) {
  const anchor = useRef<Group>(null!)
  const tag = useMemo<Tag>(() => ({ anchor, el: null, dx: 0, dy: 0, goal: null, shown: '' }), [])
  useEffect(() => {
    board.set(id, tag)
    return () => void board.delete(id)
  }, [board, id, tag])
  const fill = useRef<SVGRectElement>(null)
  const big = useRef<SVGPathElement>(null)
  const small = useRef<SVGPathElement>(null)
  const state = useLive(() =>
    shown(
      source.world.actors.find((a) => a.id === id),
      source.world.t,
    ),
  )
  useFrame(() => {
    const a = source.world.actors.find((x) => x.id === id)
    // Gone this frame: the list of who is here catches up next frame.
    if (a === undefined) return
    const pr = proportions(a.look)
    const head = headFrame(a, pr)
    anchor.current.position.set(head.p[0], head.p[1] + pr.headR * a.scale + 0.12, head.p[2])
    if (a.thinking === null || fill.current === null) return
    const p = Math.min(1, Math.max(0, a.thinking.progress))
    const top = CLOUD_BOTTOM - (CLOUD_BOTTOM - CLOUD_TOP) * p
    fill.current.setAttribute('y', top.toFixed(2))
    fill.current.setAttribute('height', (CLOUD_BOTTOM - top).toFixed(2))
    const turn = (clock.t * 140) % 360
    big.current!.setAttribute('transform', `rotate(${turn.toFixed(1)} ${BIG.x} ${BIG.y})`)
    small.current!.setAttribute('transform', `rotate(${(-turn * 1.4).toFixed(1)} ${SMALL.x} ${SMALL.y})`)
  })
  if (state === '') return <group ref={anchor} />
  const [name, colour, say, thinking, listening] = JSON.parse(state) as [string, string, string, boolean, boolean]
  return (
    <group ref={anchor}>
      <Html zIndexRange={[10, 0]} pointerEvents="none">
        <div
          className="sb-over"
          ref={(el) => {
            tag.el = el
            if (el !== null) el.style.translate = tag.shown
          }}
        >
          {thinking && (
            <svg className="sb-think" viewBox="0 0 90 72" width="78" height="62">
              <defs>
                <clipPath id={`sb-cloud-${id}`}>
                  {CLOUD.map(([x, y, r], i) => (
                    <circle key={i} cx={x} cy={y} r={r} />
                  ))}
                </clipPath>
              </defs>
              <circle cx={22} cy={62} r={5} className="sb-cloud" />
              <circle cx={15} cy={69} r={3} className="sb-cloud" />
              {CLOUD.map(([x, y, r], i) => (
                <circle key={i} cx={x} cy={y} r={r + 1.5} className="sb-cloud-edge" />
              ))}
              {CLOUD.map(([x, y, r], i) => (
                <circle key={`w${i}`} cx={x} cy={y} r={r} className="sb-cloud" />
              ))}
              <rect ref={fill} x={0} y={CLOUD_BOTTOM} width={90} height={0} clipPath={`url(#sb-cloud-${id})`} className="sb-fill" />
              <path ref={big} d={BIG.path} fillRule="evenodd" className="sb-cog" />
              <path ref={small} d={SMALL.path} fillRule="evenodd" className="sb-cog sb-cog-small" />
            </svg>
          )}
          {!thinking && listening && (
            <svg className="sb-listen" viewBox="0 0 40 40" width="34" height="34">
              <circle cx={20} cy={20} r={18} className="sb-cloud" />
              <path d="M15 27c0 3 4 4 5 1 1-3 6-5 6-11a7 7 0 0 0-14 0" className="sb-ear" />
              <path d="M17 17a3 3 0 0 1 6 0c0 2-2 2-2 4" className="sb-ear" />
              <path d="M29 12a10 10 0 0 1 0 12" className="sb-wave" />
              <path d="M33 9a14 14 0 0 1 0 18" className="sb-wave sb-wave-far" />
            </svg>
          )}
          {say !== '' && (
            <div key={say} className="sb-say">
              {say}
            </div>
          )}
          <div className="sb-name" style={{ background: colour }}>
            {name}
          </div>
        </div>
      </Html>
    </group>
  )
}
