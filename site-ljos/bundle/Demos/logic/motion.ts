// The motion demo's logic: three springs that chase one ring, how each
// is tuned, how reduced motion calms them, and where the ring hops when
// nobody leads it.

export interface Point {
    readonly x: number
    readonly y: number
}

// A spring as SpringAnimation takes it: each 16 ms tick its velocity
// gains `spring` times the distance left and loses `damping` times
// itself. Bigger `spring` is quicker, smaller `damping` is bouncier.
export interface Tuning {
    readonly spring: number
    readonly damping: number
}

// A tuning with the name the legend gives it. Its fields are written
// out, not inherited, so the checker sees them where a Spring is given.
export interface Spring {
    readonly name: string
    readonly spring: number
    readonly damping: number
}

// SpringAnimation's tick, in seconds.
export const TICK = 0.016

// How bouncy a tuning is: 1 settles with no overshoot, less than 1
// overshoots and swings back, the less the more.
export function dampingRatio(tuning: Tuning): number {
    return tuning.damping / (2 * Math.sqrt(Math.max(tuning.spring, 1e-6) * TICK))
}

// How a spring moves when the reader asks for less motion: no overshoot
// and slower, never still. Its pace falls to `pace` of its own (a third
// slower by default) and it is damped at least `settle` times critically,
// so it comes to rest without a swing past the ring.
export function calmed(tuning: Tuning, pace = 0.6, settle = 1.1): Tuning {
    const spring = tuning.spring * pace * pace
    const ratio = Math.max(dampingRatio(tuning), settle)
    return { spring, damping: 2 * ratio * Math.sqrt(spring * TICK) }
}

// The tuning a spring runs with.
export function tuned(tuning: Tuning, calm: boolean): Tuning {
    return calm ? calmed(tuning) : { spring: tuning.spring, damping: tuning.damping }
}

// A tuning as the legend says it, two figures each.
export function said(tuning: Tuning): string {
    return `spring ${tuning.spring.toFixed(2)} · damping ${tuning.damping.toFixed(2)}`
}

// One spring followed from `from` towards `to` for `seconds`, as
// SpringAnimation steps it, 16 ms a tick: where it is after each tick.
// The demo does not need it; the tests and a reader trying a tuning do.
export function trace(tuning: Tuning, from: number, to: number, seconds: number): number[] {
    const seen: number[] = []
    let value = from
    let velocity = 0
    for (let tick = 0; tick < Math.round(seconds / TICK); tick++) {
        velocity += tuning.spring * (to - value) - tuning.damping * velocity
        value += velocity * TICK
        seen.push(value)
    }
    return seen
}

// A ball as the frames move it: where it is and how fast it goes, in
// px and px per second.
export interface Body {
    readonly x: number
    readonly y: number
    readonly vx: number
    readonly vy: number
}

// A body at rest at a point.
export const NO_BODIES: Body[] = []

export function still(at: Point): Body {
    return { x: at.x, y: at.y, vx: 0, vy: 0 }
}

// The longest frame a step takes whole: a page that was hidden for a
// while comes back where it was, not flung by the time it missed.
export const LONGEST_FRAME = 0.1

// One frame of a spring after `to`, `dt` seconds long, as `trace` steps
// it: the 16 ms tick's pull and loss scaled to the frame, so the ball
// moves the same at any frame rate.
export function step(body: Body, to: Point, tuning: Tuning, dt: number): Body {
    const parts = Math.max(1, Math.ceil(Math.min(Math.max(dt, 0), LONGEST_FRAME) / TICK))
    const h = Math.min(Math.max(dt, 0), LONGEST_FRAME) / parts
    let { x, y, vx, vy } = body
    for (let part = 0; part < parts; part++) {
        // trace's change of velocity in a tick, for the part of one `h` is.
        const k = h / TICK
        vx += (tuning.spring * (to.x - x) - tuning.damping * vx) * k
        vy += (tuning.spring * (to.y - y) - tuning.damping * vy) * k
        x += vx * h
        y += vy * h
    }
    return { x, y, vx, vy }
}

// Whether a body has come to rest at `to`: within `epsilon` px of it
// and going slower than `epsilon` px a tick.
export function resting(body: Body, to: Point, epsilon = 0.25): boolean {
    return Math.abs(body.x - to.x) <= epsilon && Math.abs(body.y - to.y) <= epsilon && Math.abs(body.vx * TICK) <= epsilon && Math.abs(body.vy * TICK) <= epsilon
}

// The ring gliding to where it hops: most of the way in `lag` seconds,
// whatever the frame rate, so a hop reads as a move, not a jump.
export function glide(from: Point, to: Point, dt: number, lag: number): Point {
    const k = 1 - Math.exp(-Math.max(dt, 0) / Math.max(lag, 1e-3))
    const near = (a: number, b: number) => (Math.abs(b - a) <= 0.25 ? b : a + (b - a) * k)
    return { x: near(from.x, to.x), y: near(from.y, to.y) }
}

// Where the ring hops while nobody leads it, as parts of the stage
// across and down: round the stage and through its middle, far enough
// each time that the springs show how they differ.
export const HOPS: readonly Point[] = [
    { x: 0.22, y: 0.3 },
    { x: 0.78, y: 0.7 },
    { x: 0.5, y: 0.25 },
    { x: 0.2, y: 0.72 },
    { x: 0.8, y: 0.3 },
    { x: 0.5, y: 0.6 },
]

export function hop(index: number): Point {
    const count = HOPS.length
    return HOPS[((Math.round(index) % count) + count) % count] ?? { x: 0.5, y: 0.5 }
}

// A pointer in the stage as parts of it, kept inside an inset of
// `margin` px so the ring is never led past the stage's edge.
export function partOf(x: number, y: number, width: number, height: number, margin: number): Point {
    const across = (v: number, size: number) => {
        const room = Math.max(size - 2 * margin, 1)
        return Math.min(Math.max((v - margin) / room, 0), 1)
    }
    return { x: across(x, width), y: across(y, height) }
}

// A part of the stage back in px, inside the same inset.
export function placeOf(part: number, size: number, margin: number): number {
    return margin + part * Math.max(size - 2 * margin, 0)
}

// Where a ball rests round the ring: the balls sit evenly round it,
// the first above, `reach` px from its middle, so none hides another.
export function seat(index: number, count: number, reach: number): Point {
    const turn = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(count, 1)
    return { x: reach * Math.cos(turn), y: reach * Math.sin(turn) }
}

// How big a ball is on a stage: `share` of its shorter side, kept
// between `least` and `most` px.
export function ballOn(width: number, height: number, share: number, least = 26, most = 64): number {
    return Math.min(Math.max(Math.min(width, height) * share, least), most)
}

// A rope from the ring to a ball: how long, and at what angle in
// degrees, measured from the ring.
export interface Rope {
    readonly length: number
    readonly angle: number
}

export function rope(from: Point, to: Point): Rope {
    const dx = to.x - from.x
    const dy = to.y - from.y
    return { length: Math.hypot(dx, dy), angle: (Math.atan2(dy, dx) * 180) / Math.PI }
}
