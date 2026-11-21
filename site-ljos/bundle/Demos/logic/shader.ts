// Pure uniform maths for the fragment shader demo: loop pace, 4*pi time wrap,
// scheme-aware palette indexing, and pointer-to-UV projection.

export const LOOP_RADIANS = 4 * Math.PI

export interface UvPoint {
    readonly x: number
    readonly y: number
}

// Radians per second: every wave frequency in light.frag is a half-integer
// multiple of t, so 4*pi completes one seamless cycle in `normalSeconds`
// (or `calmSeconds` under reduced motion).
export function radiansPerSecond(calm: boolean, normalSeconds: number, calmSeconds: number): number {
    const seconds = calm ? calmSeconds : normalSeconds
    return LOOP_RADIANS / seconds
}

// Wraps shader time at 4*pi so floating-point precision never drifts and
// pausing/resuming picks up from the exact current phase.
export function advanceTime(time: number, dt: number, pace: number): number {
    const next = (time + dt * pace) % LOOP_RADIANS
    return next < 0 ? next + LOOP_RADIANS : next
}

// A remixed start palette can be any integer; it still names one of the
// scheme's ramps, counted round from the first.
function wrapPalette(choice: number, count: number): number {
    return ((choice % count) + count) % count
}

export function nextPalette(choice: number, count: number): number {
    return wrapPalette(choice + 1, count)
}

// light.frag stores dark palettes in 0..count-1 and light palettes in count..2*count-1.
export function paletteIndex(choice: number, dark: boolean, count: number): number {
    return wrapPalette(choice, count) + (dark ? 0 : count)
}

// Normalises pointer coordinates into shader UV space with Y flipped so 0 sits
// at the bottom edge, matching GLSL texture coordinates.
export function pointerUv(x: number, y: number, width: number, height: number): UvPoint {
    const w = Math.max(width, 1)
    const h = Math.max(height, 1)
    return {
        x: x / w,
        y: 1.0 - y / h,
    }
}
