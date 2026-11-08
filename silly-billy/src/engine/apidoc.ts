/**
 * The engine in words, for the designer model: what action, model and process code can use.
 * It must say exactly what `api.ts` and `kit.ts` do; the server puts it in the designer's
 * system prompt, and the interpreter gets the short list of what exists instead.
 */

import { MOODS, PUFF_KINDS, SOUND_NAMES } from './types'

export const ACTION_DOC = `ACTION CODE: the body of  function* (me, args, w) { ... }
It runs one frame at a time: \`yield\` waits one frame (1/60 s). Helpers that take time are generators: call them with \`yield*\`.
Plain JavaScript only: no imports, no async, no DOM, no Math.random (use w.random()). Every loop must yield inside, or it is stopped.

me, and every other actor (args and w.actors):
  .isActor (true) .id .name (in the game's language; set it to rename) .kind ('kid' | 'grownup' | 'cat' | 'dog') .height .radius (both already include .scale)
                .busy (doing something of its own, or told something else since this action took it in)
  .x .y .z      feet position, metres; y is the feet's height: the ground is 0, and w.groundAt(x, z) gives the floor under water. Setting them moves it at once.
  .yaw          facing, radians: 0 looks toward +z, Math.PI/2 toward +x. Forward is (Math.sin(yaw), Math.cos(yaw)).
  .pitch .roll  tip the whole body: pitch + forward, -Math.PI/2 lies on its back; roll + toward its left (cartwheels)
  .scale        whole size, 1 normal
  .pose         joints in radians; they stay as set until changed:
      .lean (+ forward) .tilt (+ toward its left) .twist (+ turns to its left)   the upper body
      .bob (metres up) .squash (1 normal, 0.7 squashed, 1.3 stretched) .tail (animals: wag)
      .head.nod (+ looks down) .head.turn (+ to its left) .head.tilt
      .armL .armR .legL .legR, each { swing, raise, bend }: swing + forward from hanging down (Math.PI points straight up),
          raise + out to the side, bend: elbow or knee. Animals: armL/armR are the front legs, legL/legR the back legs.
  .look         how it looks, live: { skin, eyes, top, bottom, shoes (colours), skirt (true/false), worn: { hair, head, face, body, back, hand: {kind, tint} } }
  .say(words, secs = 2)      a speech bubble in the game's language: me.say({ en: 'Wheee!', fi: 'Jee!' }), 1 to 4 simple words each, the fi in everyday Finnish for a five-year-old.
                             A plain string shows as it is in both: only for names, numbers and the child's own words.
  .speak(words, secs = 2)    says it aloud in its own voice, with the bubble: the child's own words (a text arg), or { en, fi }
  .feel(mood, secs = 3)      the face: ${MOODS.join(' ')}
  .holding(hand = 'right')   the item in that hand ('left' or 'right'), or null
  .riding                    the item it rides or sits on, or null
  .handAt(hand = 'right')    {x, y, z} of its hand now (an animal's mouth);  .headAt() of its head
  .ahead(dist, side = 0)     {x, z} dist metres in front of it (side: metres to its left)
  yield* .walkTo(target, {run: false, near: 0.6})  walks round solid things to an actor, item or {x, z}; stops near metres from its edge,
                             or as near as it can get when something is in the way.
                             It never backs away: to step back, yield* me.walkTo(me.ahead(-2))
  yield* .turnTo(target)     riding, it turns what it rides; sitting on something, it does not turn
  yield* .pickUp(item, hand = 'right')   walks to it and picks it up; it stays in the hand
  .drop(hand = 'right')      lets go (it falls); returns the item or null
  yield* .jump(height = 0.6, forward = 0)   one jump, forward metres along its facing
  yield* .poseTo({armR: {swing: 2}, lean: 0.3}, secs = 0.3)   eases only the joints given
  yield* .rest(secs = 0.3)   eases every joint back to standing
  yield* .ride(item)         walks to a ridable item and gets on its 'seat'. While riding, move the ITEM (its x, z, y, yaw): the rider goes with it; turning the rider turns the item.
  yield* .sitOn(item)        sits on it (null: on the ground);  yield* .getOff()   stands up next to it
  .wear(item, slot)          puts it on and it becomes part of the look: 'hair' 'head' 'face' 'body' 'back' 'hand'; slot defaults to what the thing is for; what was worn there goes in a sparkle.
                             The item stays yours: its tint, parts, state and process go on while it is worn (its size follows the wearer).
                             A 'hand' thing fills the right hand: what that hand held, and what is picked up later, goes in the left.
  .takeOff(slot)             the very thing comes off as a loose item (returned), or null
  yield* .tumble()           falls over and gets up again (a bonk)

items (args and w.items):
  .isActor (false) .id .kind ('ball', 'slide'...) .name (in the game's language: 'ball' or 'pallo') .size {w, h, d} .radius (both already include .scale) .fixed (built into the room) .flying
  .x .y .z .yaw .pitch .roll .scale   its base point and turn; while held, pitch and roll tip it in the hand.
                    Setting x, y or z holds it where you put it (left in the air, it falls after half a second).
  .vx .vy .vz       velocity: setting one (not 0) lets it fly, fall, bounce, roll and float on water by itself; 0 keeps a thing you just put somewhere there.
                    To keep a thing in a hand (a catch), yield* me.pickUp(it)
  .holder .rider .wearer   the actor holding it, riding it or wearing it, or null (a worn thing has no holder)
  .tint             a colour that paints all of it ('#ff69b4', 'pink'), or null for its own colours
  .state            your own numbers kept with the item
  .part(name)       a named part of its model: {x, y, z, rx, ry, rz, s} offsets to animate (wheels, doors, a lid); unknown names do nothing
  .anchor(name)     {x, y, z} of a named point of its model now: 'seat', 'hand', 'top', or the model's own; missing names give the top middle

w, the world:
  w.t  w.dt   seconds since the start; one frame (1/60)
  w.room ('playground' | 'pool' | 'forest')   w.size: half the room's width; keep x and z within ±w.size
  w.actors  w.items
  w.find(kind, {near, not, free})   the nearest item of that kind (or name) to near, skipping not; free: nobody holds or rides it. null if none
  w.actor(name)                     an actor by id or name, or null
  w.make(kind, {x, z, y, near, yaw}) creates an item of any kind in the library (it pops in); near puts it beside a thing
  w.remove(item)                    it vanishes in a puff
  w.throw(item, target, {speed: 8, arc: 0.35})   flings it from where it is to land on the target; returns the seconds it flies
  w.launch(item, vx, vy, vz)        sets it loose with this velocity
  w.touching(a, b)   w.distance(a, b) (on the ground)   w.angleTo(from, to) (the yaw that faces from → to)
  w.water(x, z)      true over water (the pool, the pond);  w.groundAt(x, z): the ground's height (the floor under water is lower)
  w.puff({x, y, z, at, kind, color, count: 12, size: 0.15, speed: 2, up: 1, life: 1, gravity})
      particles; at puts them at a thing's middle, and x, y or z given too wins (at: it, y: it.anchor('top').y: at its tip). kinds: ${PUFF_KINDS.join(' ')}
  w.sound(name)      ${SOUND_NAMES.join(' ')}
  w.random()  w.pick(list)  w.lerp(a, b, k)  w.clamp(v, lo, hi)  w.ease(k) (smooth 0..1)
  yield* w.wait(secs)
  yield* w.during(secs, (k, dt) => { ... })   runs every frame for secs; k goes 0 → 1
  yield* w.until(() => condition, maxSecs = 10)
  yield* w.together(animA, animB)   runs helpers side by side until all finish: yield* w.together(me.walkTo(x), friend.walkTo(y))
  w.join(actor)      another actor takes part as if told to: what it was doing stops, and it is free again when this action ends.
                     Moving another actor without it makes it wait instead, and go on with its own doing after.
                     A command the child gives it takes it out: then .busy is true, and the action leaves it alone`

export const ACTION_RULES = `How to write an action:
- Plain, short code: at most 30 lines (about 1000 characters); every line keeps the child waiting. It usually lasts 3 to 12 seconds; only something to "keep doing" may last up to 30.
- Use the args by their names. Any of them can be null: then find one (w.find), make one (w.make), or do something funny.
- Bring the body to life: poses, bounces, spins, faces (feel), puffs and sounds. Big, clear, silly movement reads from far away.
- Work from the things themselves (size, anchor, radius, positions), never from fixed numbers about them: models change.
- Keep everything gentle: nobody gets hurt. A hit is a bonk, a tumble and a giggle.
- It is seen from high above: an avatar inside a tree crown, a tent or a bush is hidden. End on top of a thing (its anchor('top')) or beside it, never inside it.
- End standing (yield* me.rest()) unless the action is to lie, sit or ride.`

export const ACTION_EXAMPLE = `// "hop", params: target (thing, optional): where to hop to
const to = args.target
if (to) yield* me.turnTo(to)
me.feel('happy')
w.sound('boing')
for (let i = 0; i < 3; i++) {
  yield* me.poseTo({ armL: { raise: 2.4 }, armR: { raise: 2.4 }, squash: 0.8 }, 0.12)
  yield* me.jump(0.5, to ? Math.min(1, w.distance(me, to) / 3) : 0)
  w.puff({ x: me.x, y: 0.05, z: me.z, kind: 'dust', count: 6 })
}
me.say({ en: 'Hop hop!', fi: 'Hyppy hyppy!' })
yield* me.rest()`

export const ITEM_DOC = `MODEL CODE: the body of  function (m) { ... }
Build the thing out of shapes. Metres; y is up; it stands on y = 0 and its front faces +z. Real sizes: a ball 0.25 across, a bike 1.6 long, a tree 4 tall, a kid 1.15 tall.
Small things a hand holds (food, toys, tools, wands) are made about twice their real size, at least 0.4 m, with the part that says what they are biggest (an ice cream's scoop), even when the description gives the real size; they still return carry: 'hand'.
Every shape takes opts { at: [x, y, z] (its centre), rot: [rx, ry, rz] (radians), scale: [sx, sy, sz], color: '#hex' or a colour name, glow: true (lights itself) }.
  m.box(w, h, d, opts)
  m.sphere(r, opts)                       scale stretches it into an egg or a lens
  m.cylinder(rTop, rBottom, h, opts)      upright along y; rTop 0 is a cone.  m.cone(r, h, opts)
  m.torus(r, tube, opts)                  a ring in the x-y plane, its hole looking along z; rot [0, Math.PI/2, 0] makes a wheel that rolls along z
  m.capsule(r, length, opts)              upright, round ends
  m.lathe([[r, y], ...], opts)            a round shape turned around the y axis through these points: vases, bells, tree crowns, cups
  m.extrude([[x, y], ...], depth, opts)   a flat outline in x-y made depth thick along z: stars, hearts, signs, leaves
  m.tube([[x, y, z], ...], r, opts)       a bendy tube through the points: handlebars, tails, hoses, curls of hair
  m.part(name, {at, rot}, () => { ... })  shapes and anchors made inside belong to a named part pivoting at at; their coordinates are from that pivot. Actions animate it with item.part(name).
                                          The same name again makes another copy that moves with it (every other light twinkling as 'light0').
  m.anchor(name, [x, y, z])               a point for actions: 'seat' (where you sit), 'hand' (where it is held), 'top', or your own
Return how it behaves: { carry: 'hand' | 'hug' | 'no', ride: false, sit: false, wear: null, bouncy: 0.3, solid: true }
  carry: picked up in one hand, hugged with both arms, or too big;  ride: ridden (needs a 'seat');  sit: sat on;
  wear: null or 'hair' 'head' 'face' 'body' 'back' 'hand';  bouncy 0..1;  solid: people walk round it.
Worn things are built around a kid 1.15 m tall: for 'hair', 'head' and 'face' the origin is the middle of the head (a ball of radius 0.23, the face toward +z, the top at y 0.23); for 'body' the origin is between the feet (hips at y 0.4, shoulders at y 0.68, 0.32 wide); for 'back' it is between the shoulder blades (the back faces -z). A 'hand' thing is held at its 'hand' anchor, upright.`

export const ITEM_RULES = `How to build a thing:
- 8 to 25 shapes. It is seen from far away, high up: make the parts that say what it is big and bold, in clear colours.
- Make it look like the thing at once: a bicycle has two big wheels, a frame and handlebars; a Christmas tree is a green cone with a star.
- Put moving bits (wheels, a lid, a tail, arms) in named parts so actions can move them.
- A loop to place many shapes is fine (a fence, petals, spokes).`

export const ITEM_EXAMPLE = `// "scooter": a kick scooter, front toward +z
const red = '#e8503f'
m.box(0.16, 0.05, 0.75, { at: [0, 0.12, 0], color: red })
for (const z of [-0.32, 0.36]) {
  m.part(z > 0 ? 'wheelFront' : 'wheelBack', { at: [0, 0.08, z] }, () => {
    m.torus(0.06, 0.025, { rot: [0, Math.PI / 2, 0], color: '#2b2b30' })
  })
}
m.cylinder(0.025, 0.025, 0.75, { at: [0, 0.5, 0.36], rot: [-0.15, 0, 0], color: '#9aa3ad' })
m.capsule(0.03, 0.4, { at: [0, 0.88, 0.42], rot: [0, 0, Math.PI / 2], color: '#2b2b30' })
m.anchor('seat', [0, 0.15, 0])
return { carry: 'hug', ride: true, solid: false, bouncy: 0.2 }`

export const TICK_DOC = `PROCESS CODE (optional): the body of  function (it, w, dt) { ... }
Runs every frame for every item of this kind, also while one is worn (then it goes where its wearer goes, and its parts and tint still show): spin wheels by how far it moved (keep the last position in it.state), twinkle lights, puff smoke. No loops, no yield; a few lines.`
