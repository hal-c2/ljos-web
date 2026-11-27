// The shader demo's logic: the fragment shader it draws with, as text a
// reader edits, and the maths of its uniforms: the clock, where the
// light's vortex is, a tap's ripple, and what the compiler said of an
// edit, as the editor marks it.

export const LOOP_RADIANS = 4 * Math.PI

// The shader the demo opens with. The effect draws it from this text,
// and the editor beside it edits the same text: what the reader types
// is what the next frame draws. Every pace in it is a whole number of
// halves of `time`, so a loop of 4 pi meets itself with no seam.
export const SOURCE = `#version 300 es
// Liquid light. Edit anything here: the picture follows as you type.
// The four constants are the knobs.
precision highp float;

const float FLOW = 1.0;    // how far the light folds over itself
const float SWIRL = 3.0;   // how hard the pointer twists it
const float SCALE = 3.4;   // the size of the bands: smaller is bigger
const float GLOW = 1.0;    // how brightly the edges burn

// The three colours each palette runs through. Change one and see.
const vec3 AURORA[3] = vec3[3](vec3(0.10, 0.95, 0.75), vec3(0.30, 0.40, 1.00), vec3(0.95, 0.25, 0.85));
const vec3 EMBER[3]  = vec3[3](vec3(1.00, 0.32, 0.12), vec3(1.00, 0.78, 0.22), vec3(0.80, 0.10, 0.45));
const vec3 LAGOON[3] = vec3[3](vec3(0.05, 0.75, 1.00), vec3(0.15, 0.95, 0.55), vec3(0.35, 0.30, 1.00));

// Each uniform is the effect's property of the same name.
uniform float time;        // 0 to 4 pi, round and round
uniform vec2 pointer;      // where the light swirls, 0 to 1 across and down
uniform vec2 tap;          // where the last tap was
uniform float ripple;      // seconds since that tap
uniform float palette;     // which colours: 0, 1 or 2
uniform float dark;        // 1 on a dark page, 0 on a light one
uniform vec2 resolution;   // the effect's size

in vec2 qt_TexCoord0;
out vec4 fragColor;

// The palette's colour at x, round its three and back to the first.
vec3 colours(float x) {
    float f = fract(x) * 3.0;
    int i = int(f);
    vec3 from, to;
    for (int k = 0; k < 3; k++) {
        vec3 a = palette < 0.5 ? AURORA[k] : palette < 1.5 ? EMBER[k] : LAGOON[k];
        vec3 b = palette < 0.5 ? AURORA[(k + 1) % 3] : palette < 1.5 ? EMBER[(k + 1) % 3] : LAGOON[(k + 1) % 3];
        if (k == i) { from = a; to = b; }
    }
    return mix(from, to, smoothstep(0.0, 1.0, fract(f)));
}

vec2 place(vec2 at) {
    return (at - 0.5) * vec2(resolution.x / resolution.y, 1.0) * SCALE;
}

void main() {
    vec2 p = place(qt_TexCoord0);
    vec2 m = place(pointer);

    // The pointer's vortex: space twists round it, most near it.
    vec2 d = p - m;
    float near = exp(-dot(d, d) * 1.2);
    float a = SWIRL * near;
    p = m + mat2(cos(a), sin(a), -sin(a), cos(a)) * d;

    // A tap's ripple: a ring that runs out and fades.
    vec2 q = p - place(tap);
    float ring = exp(-pow((length(q) - ripple * 2.2) * 5.0, 2.0)) * exp(-ripple * 1.4);
    p += normalize(q + 1e-4) * ring * 0.6;

    // Space folded over itself: the flow.
    for (int i = 1; i < 6; i++) {
        float k = float(i);
        p += FLOW * 0.6 / k * vec2(sin(k * p.y + 0.5 * k * time),
                                   cos(k * p.x - 0.5 * (6.0 - k) * time));
    }

    float v = 0.7 * sin(p.x + 0.5 * time) * cos(p.y) + 0.3 * sin(2.0 * length(p) - time);
    vec3 hue = colours(0.4 * v + time / 6.28318);
    float edge = GLOW * 0.05 / (abs(v) + 0.05);   // bright where v crosses 0
    float body = smoothstep(-0.7, 1.0, v);

    vec3 night = hue * (0.06 + 0.6 * body) + hue * edge * 0.9 + near * 0.12 + ring * 0.5;
    vec3 day = mix(vec3(0.98, 0.975, 0.96), hue, 0.35 + 0.5 * body);
    day = mix(day, hue * 0.35, edge * 0.6) - ring * 0.2;
    fragColor = vec4(mix(day, night, dark), 1.0);
}
`

// The palettes the shader draws, by the `palette` uniform it is given.
export const PALETTES = ["Aurora", "Ember", "Lagoon"] as const

// The chip's swatch for palette `index`: the palette's first colour.
const SWATCHES: readonly string[] = ["#1af2bf", "#ff521f", "#0dbfff"]
export function swatchOf(index: number): string {
    return SWATCHES[index] ?? SWATCHES[0] ?? "#1af2bf"
}


export interface Point {
    readonly x: number
    readonly y: number
}

// Radians per second: one loop of 4 pi in `normalSeconds`, or in
// `calmSeconds` under reduced motion, which slows it and never stops it.
export function radiansPerSecond(calm: boolean, normalSeconds: number, calmSeconds: number): number {
    const seconds = Math.max(calm ? calmSeconds : normalSeconds, 0.001)
    return LOOP_RADIANS / seconds
}

// The clock wraps at 4 pi so its precision never drifts, and a pause
// resumes from the exact phase it held.
export function advanceTime(time: number, dt: number, pace: number): number {
    const next = (time + dt * pace) % LOOP_RADIANS
    return next < 0 ? next + LOOP_RADIANS : next
}

// A palette as one the shader draws, whatever number a remix gives.
export function paletteOf(choice: number): number {
    const count = PALETTES.length
    return ((Math.round(choice) % count) + count) % count
}

// Where the light swirls when no pointer is over it: a slow figure that
// goes round the middle of the picture and meets itself each loop.
export function wander(time: number): Point {
    return {
        x: 0.5 + 0.3 * Math.sin(time * 0.5),
        y: 0.5 + 0.22 * Math.sin(time),
    }
}

// The pointer in the effect's own terms: 0 to 1 across and down, as the
// shader's qt_TexCoord0 is.
export function uvOf(x: number, y: number, width: number, height: number): Point {
    return {
        x: Math.min(Math.max(x / Math.max(width, 1), 0), 1),
        y: Math.min(Math.max(y / Math.max(height, 1), 0), 1),
    }
}

// The vortex eases after where it is led, about a fifth of a second
// behind (a second and a half under reduced motion), whatever the frame
// rate, so it never jumps.
export function follow(from: Point, to: Point, dt: number, calm: boolean): Point {
    const lag = calm ? 1.5 : 0.2
    const k = 1 - Math.exp(-Math.max(dt, 0) / lag)
    return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }
}

// Seconds since the last tap, as the ripple runs out: it stops counting
// once the ring has faded, so a quiet picture does not count for ever.
export const RIPPLE_DONE = 6

export function advanceRipple(ripple: number, dt: number, calm: boolean): number {
    return Math.min(ripple + dt * (calm ? 0.35 : 1), RIPPLE_DONE)
}

export const NO_DIAGNOSTICS: Diagnostic[] = []

export interface Diagnostic {
    readonly message: string
    readonly line: number
    readonly column: number
    readonly severity: "error"
}

// What a GLSL compiler said, as the editor's diagnostics: its lines
// read `ERROR: 0:12: 'x' : undeclared identifier`, the number after
// the colon the line in the shader's text. A line it names past the
// text is the last; a message with no line is on the first.
export function diagnosticsOf(log: string, source: string): Diagnostic[] {
    const lines = source.split("\n").length
    const found: Diagnostic[] = []
    for (const raw of log.split("\n")) {
        const said = raw.trim()
        if (said === "" || said.startsWith("WARNING")) continue
        const named = /^ERROR:\s*\d+:(\d+):\s*(.*)$/.exec(said)
        const line = named ? Math.min(Math.max(Number(named[1]), 1), lines) : 1
        const message = (named ? named[2] : said.replace(/^ERROR:\s*/, "")).trim()
        if (message === "" || /compilation (terminated|errors?\b)/.test(message)) continue
        found.push({ message, line, column: 1, severity: "error" })
    }
    return found
}

// The compiler's words for the reader, a line for each, with where.
export function toldOf(diagnostics: readonly Diagnostic[]): string {
    return diagnostics.map((d) => `Line ${d.line}: ${d.message}`).join("\n")
}
