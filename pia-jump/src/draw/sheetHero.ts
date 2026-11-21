import { BOSS_BOX, HZ, SHELL_PEEK, type Enemy, type EnemyKind, type EnemyState, type Form, type Kitten, type Room, type Sim } from '../game/model'
import { createSim, heroBox } from '../game/sim'
import { drawEnemy, drawKitten, type KittenPose } from './critters'
import { drawHero, hugAt } from './hero'
import { COLOR, type Rim } from './look'
import type { SheetCell } from './sheet'
import { drawBed, drawPole } from './things'
import { ROOM_LOOK } from './world'

const NIGHT: Rim = { colour: COLOR.nightRim, width: 0.05 }
const KITTENS: readonly Kitten[] = ['sunny', 'coco', 'mochi', 'lulu', 'pepper']

/** Draws a character twice on a night room (or when asked): the moonlight rim first, then the character. */
function lit(room: Room, night: boolean, draw: (rim: Rim) => void) {
  if (night || ROOM_LOOK[room.id].night) draw(NIGHT)
  draw(null)
}

/** A sim for the room at time t (its tick is t), with Pia in `form`, patched by `set`; stamps are written as ticks before s.tick. */
function heroSim(room: Room, t: number, form: Form, set: (s: Sim, t: number) => void): Sim {
  const s = createSim(room)
  s.tick = Math.round(t * HZ)
  s.hero.form = form
  ;[s.hero.w, s.hero.h] = heroBox(form)
  set(s, t)
  return s
}

/** `seconds` ago, as a tick stamp in s. */
const ago = (s: Sim, seconds: number) => s.tick - Math.round(seconds * HZ)

/** A cell of Pia in a hand-made state, drawn at the sheet's time (or at `at(t)` for the cells that need a moment: a blink). On the pole, the pole stands in front of her. */
function pia(label: string, form: Form, set: (s: Sim, t: number) => void, at: (t: number) => number, night: boolean): SheetCell {
  return {
    label,
    w: form === 'small' ? 1.7 : 2,
    h: form === 'small' ? 2.3 : 3.1,
    draw: (ctx, room, t0) => {
      const t = at(t0)
      const s = heroSim(room, t, form, set)
      if (s.phase === 'pole') {
        const x = s.hero.w / 2 + 0.11
        ctx.translate(x, 0)
        drawPole(ctx, room, s, t)
        ctx.translate(-x, 0)
      }
      lit(room, night, (rim) => drawHero(ctx, s, t, rim))
    },
  }
}
const now = (t: number) => t

/** Pia's poses for one form, as patches over a fresh sim. */
function poses(form: Form): SheetCell[] {
  const f = form
  const cells: SheetCell[] = [
    pia(`${f} idle`, f, () => {}, now, false),
    pia(
      `${f} blink`,
      f,
      () => {},
      (t) => t - (t % 3.7) + 0.05,
      false,
    ),
    pia(`${f} walk`, f, (s, t) => ((s.hero.vx = 3.5), (s.hero.stride = t * 3.5)), now, false),
    pia(`${f} run`, f, (s, t) => ((s.hero.vx = 7.5), (s.hero.stride = t * 7.5)), now, false),
    pia(`${f} skid`, f, (s) => ((s.hero.vx = -5), (s.hero.skidding = true), (s.input.move = 1)), now, false),
    pia(`${f} take-off`, f, (s) => ((s.hero.grounded = false), (s.hero.vy = -15), (s.hero.jumpedAt = ago(s, 0.03))), now, false),
    pia(`${f} rise`, f, (s) => ((s.hero.grounded = false), (s.hero.vy = -10)), now, false),
    pia(`${f} apex`, f, (s) => ((s.hero.grounded = false), (s.hero.vy = 0)), now, false),
    pia(`${f} fall`, f, (s) => ((s.hero.grounded = false), (s.hero.vy = 12)), now, false),
    pia(`${f} land`, f, (s) => (s.hero.landedAt = ago(s, 0.02)), now, false),
    pia(`${f} bonk`, f, (s) => ((s.hero.grounded = false), (s.hero.vy = 0), (s.hero.bonkedAt = ago(s, 0.02))), now, false),
  ]
  if (form === 'small') cells.push(pia('small dizzy', f, (s) => ((s.hero.hurtAt = ago(s, 0.1)), (s.hero.dizzyUntil = s.tick + 40)), now, false))
  else cells.push(pia(`${f} hurt`, f, (s) => (s.hero.hurtAt = ago(s, 0.1)), now, false))
  if (form === 'bubble') cells.push(pia('bubble blow', f, (s) => (s.hero.blewAt = ago(s, 0.05)), now, false))
  cells.push(
    pia(
      `${f} safe blink`,
      f,
      (s) => (s.hero.safeUntil = s.tick + 200),
      (t) => t - (t % 0.125) + 0.07,
      false,
    ),
    pia(`${f} ball`, f, (s) => (s.hero.ballUntil = s.tick + 600), now, false),
    pia(
      `${f} ball ending`,
      f,
      (s) => (s.hero.ballUntil = s.tick + 100),
      (t) => t - (t % 0.25) + 0.05,
      false,
    ),
    pia(`${f} rescue`, f, (s) => ((s.phase = 'rescue'), (s.phaseAt = ago(s, 0.5)), (s.hero.grounded = false)), now, false),
    pia(`${f} pole`, f, (s) => ((s.phase = 'pole'), (s.phaseAt = ago(s, 0.3)), (s.hero.grounded = false), (s.hero.vy = 7)), now, false),
    pia(`${f} walk home`, f, (s, t) => ((s.phase = 'walk'), (s.hero.vx = 3), (s.hero.stride = t * 3)), now, false),
    pia(`${f} found hop`, f, (s) => ((s.phase = 'found'), (s.phaseAt = ago(s, 0.17))), now, false),
  )
  return cells
}

/** Pia hugging her room's kitten: the kitten drawn first, at hugAt, as the stage does. */
function hug(form: Form, night: boolean): SheetCell {
  return {
    label: `${night ? 'night: ' : ''}${form} hug`,
    w: 2,
    h: form === 'small' ? 2.3 : 3.1,
    draw: (ctx, room, t) => {
      const s = heroSim(room, t, form, (s2) => ((s2.phase = 'found'), (s2.phaseAt = ago(s2, 1.5))))
      const [x, y] = hugAt(form)
      lit(room, night, (rim) => {
        ctx.translate(x, y)
        drawKitten(ctx, room.kitten, 'hug', t, rim)
        ctx.translate(-x, -y)
        drawHero(ctx, s, t, rim)
      })
    },
  }
}

/** Pia's look partway through a change of form: a change `seconds` ago from `was` into `form` (in a big cell, since she is big for part of it). */
function change(label: string, was: Form, form: Form, seconds: number): SheetCell {
  return { ...pia(label, form, (s) => ((s.hero.changedAt = ago(s, seconds)), (s.hero.was = was), (s.phase = 'freeze'), (s.phaseAt = ago(s, seconds))), now, false), w: 2, h: 3.1 }
}

/** An enemy of a kind in a state, `age` seconds into it, at hp (the Big Grumble's size), drawn at the sheet's time. */
function foe(label: string, kind: EnemyKind, state: EnemyState, hp: number, age: number, w: number, h: number, night: boolean): SheetCell {
  return {
    label,
    w,
    h,
    draw: (ctx, room, t) => {
      const tick = Math.round(t * HZ)
      const [bw, bh] = kind === 'boss' ? (state === 'bunny' ? [0.7, 0.6] : BOSS_BOX[Math.max(1, hp) - 1]!) : [0.8, 0.7]
      const e: Enemy = {
        x: 0,
        y: 0,
        px: 0,
        py: 0,
        vx: state === 'slide' ? 8 : 1.4,
        vy: 0,
        w: bw,
        h: bh,
        kind,
        state,
        stateAt: tick - Math.round(age * HZ),
        facing: 1,
        grounded: true,
        hp,
        baseY: 0,
      }
      lit(room, night, (rim) => drawEnemy(ctx, e, t, rim))
    },
  }
}

/** A kitten in a pose, drawn at the sheet's time (or at `at(t)`). */
function kitten(name: Kitten, pose: KittenPose, label: string, at: (t: number) => number, night: boolean): SheetCell {
  return { label, w: 1.3, h: pose === 'hug' ? 1.9 : 1.5, draw: (ctx, room, t) => lit(room, night, (rim) => drawKitten(ctx, name, pose, at(t), rim)) }
}

/**
 * Pia, the kittens and the enemies in every form, pose and state, for ?sheet=hero: the
 * place to point at any sprite. On the Roof (&room=roof) every cell wears the night rim;
 * the cells named "night:" wear it in every room.
 */
export const HERO_SHEET: readonly SheetCell[] = [
  ...poses('small'),
  hug('small', false),
  ...poses('big'),
  hug('big', false),
  ...poses('bubble'),
  hug('bubble', false),
  change('cupcake: 0.04 s', 'small', 'big', 0.04),
  change('cupcake: 0.08 s', 'small', 'big', 0.08),
  change('cupcake: 0.15 s', 'small', 'big', 0.15),
  change('cupcake: 0.25 s', 'small', 'big', 0.25),
  change('wand: big to bubble', 'big', 'bubble', 0.2),
  change('wand: small to bubble', 'small', 'bubble', 0.15),
  change('hit: big to small 0.1 s', 'big', 'small', 0.1),
  change('hit: big to small 0.2 s', 'big', 'small', 0.2),
  change('hit: bubble to big', 'bubble', 'big', 0.1),
  foe('grumble asleep', 'grumble', 'asleep', 1, 0, 1.4, 1.8, false),
  foe('grumble yawn', 'grumble', 'yawn', 1, 0.3, 1.4, 1.6, false),
  foe('grumble wakes', 'grumble', 'yawn', 1, 0.45, 1.4, 1.6, false),
  foe('grumble walk', 'grumble', 'walk', 1, 1, 1.4, 1.6, false),
  foe('grumble stomped', 'grumble', 'poof', 1, 0.04, 1.4, 1.6, false),
  foe('grumble poof', 'grumble', 'poof', 1, 0.2, 1.6, 2.2, false),
  foe('grumble fluff', 'grumble', 'poof', 1, 0.55, 1.4, 2.6, false),
  foe('grumble knocked', 'grumble', 'knocked', 1, 0.2, 1.4, 1.6, false),
  foe('grumble trapped', 'grumble', 'trapped', 1, 0.3, 1.6, 1.8, false),
  foe('snail asleep', 'snail', 'asleep', 1, 0, 1.5, 1.8, false),
  foe('snail yawn', 'snail', 'yawn', 1, 0.3, 1.5, 1.7, false),
  foe('snail walk', 'snail', 'walk', 1, 1, 1.5, 1.7, false),
  foe('shell', 'snail', 'shell', 1, 1, 1.4, 1.5, false),
  foe('shell peeks', 'snail', 'shell', 1, SHELL_PEEK + 0.6, 1.4, 1.5, false),
  foe('shell slide', 'snail', 'slide', 1, 0.3, 2, 1.5, false),
  foe('snail knocked', 'snail', 'knocked', 1, 0.2, 1.5, 1.7, false),
  foe('snail trapped', 'snail', 'trapped', 1, 0.3, 1.6, 1.8, false),
  foe('bee asleep', 'bee', 'asleep', 1, 0, 1.3, 1.6, false),
  foe('bee yawn', 'bee', 'yawn', 1, 0.3, 1.3, 1.4, false),
  foe('bee buzz', 'bee', 'walk', 1, 1, 1.3, 1.4, false),
  foe('bee knocked', 'bee', 'knocked', 1, 0.2, 1.3, 1.4, false),
  foe('bee trapped', 'bee', 'trapped', 1, 0.3, 1.6, 1.8, false),
  foe('boss 3 asleep', 'boss', 'asleep', 3, 0, 3.2, 4.4, false),
  foe('boss 3 walk', 'boss', 'walk', 3, 1, 3.2, 4.2, false),
  foe('boss 2 hit', 'boss', 'dizzy', 2, 0.05, 3.2, 4.2, false),
  foe('boss 2 dizzy', 'boss', 'dizzy', 2, 0.8, 2.6, 3.6, false),
  foe('boss 2 walk', 'boss', 'walk', 2, 1, 2.6, 3.3, false),
  foe('boss 1 dizzy', 'boss', 'dizzy', 1, 0.8, 2, 2.8, false),
  foe('boss 1 walk', 'boss', 'walk', 1, 1, 2, 2.6, false),
  foe('bunny', 'boss', 'bunny', 0, 0.5, 1.3, 1.5, false),
  {
    label: 'kitten in its bed',
    w: 3,
    h: 3,
    draw: (ctx, room, t) => {
      drawBed(ctx, room, 0, t)
      lit(room, false, (rim) => drawKitten(ctx, room.kitten, 'hidden', t, rim))
    },
  },
  ...KITTENS.flatMap((name) => [
    kitten(name, 'hidden', `${name} hidden`, now, false),
    kitten(name, 'sit', `${name} sit`, (t) => t - (t % 3.2) + 1.6, false),
    kitten(name, 'sit', `${name} waves`, (t) => t - (t % 3.2) + 0.45, false),
    kitten(name, 'hop', `${name} hop`, now, false),
    kitten(name, 'hug', `${name} hug`, now, false),
    kitten(name, 'dance', `${name} dance`, now, false),
  ]),
  pia('night: small idle', 'small', () => {}, now, true),
  pia('night: big run', 'big', (s, t) => ((s.hero.vx = 7.5), (s.hero.stride = t * 7.5)), now, true),
  pia('night: bubble ball', 'bubble', (s) => (s.hero.ballUntil = s.tick + 600), now, true),
  hug('small', true),
  foe('night: grumble walk', 'grumble', 'walk', 1, 1, 1.4, 1.6, true),
  foe('night: snail walk', 'snail', 'walk', 1, 1, 1.5, 1.7, true),
  foe('night: bee buzz', 'bee', 'walk', 1, 1, 1.3, 1.4, true),
  foe('night: boss 1 walk', 'boss', 'walk', 1, 1, 2, 2.6, true),
  kitten('pepper', 'sit', 'night: pepper sit', now, true),
  kitten('mochi', 'dance', 'night: mochi dance', now, true),
]
