// What the Kestrel demo (WatchDemo.qml) reads of the watch it frames
// (Demos/Watch/Watch.qml, the state its Pages hold), what its 3D screen's
// canvas draws with, and where its row of keys stands.

// The watch's state and the hardware it answers to, as far as the frame
// reads and drives it.
export interface Watch {
    readonly ambient: boolean
    alwaysOn: boolean
    readonly bloom: boolean
    readonly hours: number
    readonly minutes: number
    readonly seconds: number
    pressSide(): void
    touch(): void
    nextFace(): void
    sleep(): void
    turnCrown(steps: number): void
}
// No watch until the app has loaded.
export type MaybeWatch = Watch | undefined

function isWatch(value: unknown): value is Watch {
    return typeof value === "object" && value !== null && "ambient" in value && "alwaysOn" in value && "turnCrown" in value
}

// The watch the app's Pages hold, or nothing.
export function watchOf(pages: unknown): MaybeWatch {
    if (typeof pages !== "object" || pages === null || !("watch" in pages)) return undefined
    const watch = pages.watch
    return isWatch(watch) ? watch : undefined
}

// The canvas's 2D context, as far as the 3D screen's picture draws with it.
export interface Pen {
    fillStyle: string
    strokeStyle: string
    lineWidth: number
    lineCap: string
    fillRect(x: number, y: number, w: number, h: number): void
    beginPath(): void
    moveTo(x: number, y: number): void
    lineTo(x: number, y: number): void
    arc(x: number, y: number, r: number, from: number, to: number): void
    stroke(): void
    fill(): void
}

export function isPen(value: unknown): value is Pen {
    return typeof value === "object" && value !== null && "beginPath" in value && "stroke" in value
}

// Where a key stands, from the left and top of the row of keys.
export interface Spot {
    readonly x: number
    readonly y: number
}
export const origin: Spot = { x: 0, y: 0 }

// Where each key stands, by its place, and how tall the lines are.
export interface Spots {
    readonly at: readonly Spot[]
    readonly height: number
}
export const noSpots: Spots = { at: [], height: 0 }

// The keys of these widths in lines as wide as `room` allows, `gap` apart,
// each line centred; a line is 36 tall.
export function spots(sizes: readonly number[], gap: number, room: number): Spots {
    const none: readonly number[] = []
    const lines: number[][] = [[]]
    let used = -gap
    for (let i = 0; i < sizes.length; i++) {
        const size = sizes[i] ?? 0
        const last = lines[lines.length - 1] ?? none
        if (last.length > 0 && used + gap + size > room) {
            lines.push([])
            used = -gap
        }
        lines[lines.length - 1]?.push(i)
        used += gap + size
    }
    const at: Spot[] = []
    for (let row = 0; row < lines.length; row++) {
        const line = lines[row] ?? none
        let x = (room - line.reduce((sum: number, i: number) => sum + (sizes[i] ?? 0) + gap, -gap)) / 2
        for (const i of line) {
            at[i] = { x: Math.round(x), y: row * (36 + gap) }
            x += (sizes[i] ?? 0) + gap
        }
    }
    return { at: at, height: lines.length * (36 + gap) - gap }
}
