// What /screenshots/ reads and how it says it: the manifest a deploy's
// capture writes beside the page (site-ljos/shots/), the pictures a
// filter leaves, how a picture is named, and the new-issue address that
// reports one. Pure, so tests/screenshots.spec.js holds it as the page
// does; the page only fetches and draws.

export type Kernel = "solid" | "wasm"
export type Gpu = "webgpu" | "webgl2"
export type Scheme = "light" | "dark"
export type Status = "same" | "changed" | "new" | "broken"

export interface Viewport {
    readonly name: string
    readonly width: number
    readonly height: number
}

export interface Box {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
}

export interface Picture {
    readonly file: string
    readonly thumb: string
}

export interface Shot {
    readonly id: string
    readonly target: string
    readonly kind: string
    readonly title: string
    readonly route: string
    readonly kernel: Kernel
    // The renderer a GPU-drawn shot was taken with; null for what draws
    // in the DOM alone, which no GPU setting changes.
    readonly gpu: Gpu | null
    readonly scheme: Scheme
    readonly shell: string
    readonly viewport: Viewport
    readonly file: string
    readonly thumb: string
    readonly width: number
    readonly height: number
    readonly health: { readonly ok: boolean; readonly problems: readonly string[] }
    // Boxes of the picture that move on their own (a canvas drawing a
    // new frame each moment): checked that they drew, left out of the
    // comparison. Absent from a manifest written before they were.
    readonly moving?: readonly Box[]
    readonly before: Picture | null
    readonly diff: { readonly ratio: number; readonly file: string | null } | null
    readonly status: Status
    // Why a pull request said this picture changes on purpose, and which
    // one, or null.
    readonly accepted: { readonly reason: string; readonly pr: number | null } | null
}

export interface Deploy {
    readonly sha: string
    readonly date: string
}

export interface Manifest extends Deploy {
    readonly format: "ljos-shots"
    readonly version: 1
    readonly repository: string
    // The share of a picture's pixels that may differ before it is
    // called changed.
    readonly threshold: number
    readonly previous: Deploy | null
    readonly gone: readonly string[]
    readonly shots: readonly Shot[]
}

export interface Filter {
    readonly status: "all" | "changed" | "broken"
    readonly kernel: "all" | Kernel
    readonly scheme: "all" | Scheme
}

export const everything: Filter = { status: "all", kernel: "all", scheme: "all" }

// A manifest as fetched, or null for anything that is not one this page
// can read (none yet, or another version).
export function readManifest(value: unknown): Manifest | null {
    if (typeof value !== "object" || value === null) return null
    const said = value as Partial<Manifest>
    if (said.format !== "ljos-shots" || said.version !== 1 || !Array.isArray(said.shots)) return null
    return value as Manifest
}

// The manifest beside the page, or null where the deploy wrote none.
export async function load(address: string): Promise<Manifest | null> {
    try {
        const response = await globalThis.fetch(address, { cache: "no-cache" })
        if (!response.ok) return null
        return readManifest(await response.json())
    } catch {
        return null
    }
}

// Whether part of a shot moves on its own, and so was not compared.
export const moves = (shot: Shot): boolean => (shot.moving ?? []).length > 0

export function counts(shots: readonly Shot[]): { all: number; changed: number; broken: number } {
    return {
        all: shots.length,
        changed: shots.filter((shot) => shot.status === "changed").length,
        broken: shots.filter((shot) => shot.status === "broken").length,
    }
}

export function kept(shot: Shot, filter: Filter): boolean {
    if (filter.status !== "all" && shot.status !== filter.status) return false
    if (filter.kernel !== "all" && shot.kernel !== filter.kernel) return false
    return filter.scheme === "all" || shot.scheme === filter.scheme
}

export interface Group {
    readonly target: string
    readonly title: string
    readonly kind: string
    readonly route: string
    readonly shots: readonly Shot[]
}

// The pictures a filter leaves, by what they are of, in the manifest's
// order: one heading per demo or shell.
export function groups(shots: readonly Shot[], filter: Filter): Group[] {
    const made: Group[] = []
    const at = new Map<string, Shot[]>()
    for (const shot of shots) {
        if (!kept(shot, filter)) continue
        let held = at.get(shot.target)
        if (held === undefined) {
            held = []
            at.set(shot.target, held)
            made.push({ target: shot.target, title: shot.title, kind: shot.kind, route: shot.route, shots: held })
        }
        held.push(shot)
    }
    return made
}

export interface Names {
    readonly kernels: Readonly<Record<Kernel, string>>
    readonly gpus: Readonly<Record<Gpu, string>>
}

// The names an issue is written with, for the maintainers who read it;
// the page says them in its own words (Site/ShotsWords.qml).
export const NAMES: Names = { kernels: { solid: "Solid kernel", wasm: "wasm kernel" }, gpus: { webgpu: "WebGPU", webgl2: "WebGL 2" } }

// The renderer a shot was taken on, in words: its kernel, and its GPU
// where it draws on one.
export function renderer(shot: Shot, names: Names = NAMES): string {
    return shot.gpu === null ? names.kernels[shot.kernel] : `${names.kernels[shot.kernel]}, ${names.gpus[shot.gpu]}`
}

// What a shot is of and how it was taken, as its tile is named: "Svala
// GT: wasm kernel, WebGPU, dark, desktop 1440×900".
export function label(shot: Shot, names: Names = NAMES, schemes: Readonly<Record<Scheme, string>> = { light: "light", dark: "dark" }): string {
    return `${shot.title}: ${renderer(shot, names)}, ${schemes[shot.scheme]}, ${size(shot)}`
}

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" })

// A deploy's time as a reader reads it: "20 November 2026, 14:05 UTC".
export function when(iso: string): string {
    const at = new Date(iso)
    return Number.isNaN(at.getTime()) ? iso : `${DAY.format(at)}, ${TIME.format(at)} UTC`
}

export const short = (sha: string): string => sha.slice(0, 7)

// A file the manifest names, as the page reaches it: beside the
// manifest, under the site's base.
export function beside(base: string, file: string): string {
    return `${base}screenshots/${file}`
}

export function pullAddress(manifest: Manifest, pr: number): string {
    return `https://github.com/${manifest.repository}/pull/${pr}`
}

export function size(shot: Shot): string {
    return `${shot.viewport.name} ${shot.viewport.width}×${shot.viewport.height}`
}

// A share of pixels as a reader reads it: "0.4 %", "12 %", "< 0.1 %".
export function share(ratio: number): string {
    const percent = ratio * 100
    if (percent > 0 && percent < 0.1) return "< 0.1 %"
    return `${percent < 10 ? percent.toFixed(1) : Math.round(percent)} %`
}

export function commitAddress(manifest: Manifest, sha: string): string {
    return `https://github.com/${manifest.repository}/commit/${sha}`
}

// The new-issue form on the site's repository with the picture already
// written in: the reader files it, or not; the site files nothing.
// `at` turns a path beside the page into the address a maintainer opens.
export function issueAddress(manifest: Manifest, shot: Shot, at: (file: string) => string): string {
    const lines = [
        `Shot: \`${shot.id}\``,
        `Of: ${shot.title} (${shot.route})`,
        `Commit: ${commitAddress(manifest, manifest.sha)}`,
        `Deployed: ${manifest.date}`,
        `Renderer: ${renderer(shot)}`,
        `Scheme: ${shot.scheme}`,
        `Size: ${size(shot)}`,
        `Image: ${at(shot.file)}`,
    ]
    if (shot.before !== null) lines.push(`Before: ${at(shot.before.file)}${manifest.previous === null ? "" : ` (${manifest.previous.sha.slice(0, 7)})`}`)
    if (shot.diff !== null && shot.diff.file !== null) lines.push(`Difference: ${at(shot.diff.file)} (${share(shot.diff.ratio)} of pixels)`)
    if (shot.health.problems.length > 0) lines.push(`Problems: ${shot.health.problems.join("; ")}`)
    if (moves(shot)) lines.push("Moving: its moving part was left out of the comparison")
    lines.push("", "What looks wrong:", "")
    const query = new URLSearchParams({ title: `Screenshot: ${shot.title}, ${renderer(shot)}, ${shot.scheme}, ${shot.viewport.name}`, body: lines.join("\n") })
    return `https://github.com/${manifest.repository}/issues/new?${query.toString()}`
}
