// What /screenshots/ reads and how it says it: the manifest a deploy's
// capture writes beside the page (site-ljos/shots/), the pictures a
// filter leaves, how a picture is named, and the new-issue address that
// reports one. Pure, so tests/screenshots.spec.js holds it as the page
// does; the page only fetches and draws.

import { dayText, queryText, timeOf, timeText, uncached } from "./shots-platform.js"

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

export type AdapterKind = "hardware" | "software" | "unknown"
export type Api = Gpu | "webgl"

// What drew a picture, which is not always the renderer asked for: the
// browser, and the adapter that answered.
export interface DrawnBy {
    readonly browser: string
    readonly version: string
    // Absent for what draws in the DOM, put down to the browser's adapter.
    readonly api?: Api | undefined
    readonly adapter: string
    readonly kind: AdapterKind
}

export interface Health {
    readonly ok: boolean
    readonly problems: readonly string[]
}

export interface Diff {
    readonly ratio: number
    readonly file?: string | undefined
}

export interface Accepted {
    readonly reason: string
    readonly pr?: number | undefined
}

export interface Shot {
    readonly id: string
    readonly target: string
    readonly kind: string
    readonly title: string
    readonly route: string
    readonly kernel: Kernel
    // The renderer a GPU-drawn shot was taken with; absent for what draws
    // in the DOM alone, which no GPU setting changes.
    readonly gpu?: Gpu | undefined
    readonly scheme: Scheme
    readonly shell: string
    readonly viewport: Viewport
    readonly file: string
    readonly thumb: string
    readonly width: number
    readonly height: number
    readonly health: Health
    // Boxes of the picture that move on their own (a canvas drawing a
    // new frame each moment): checked that they drew, left out of the
    // comparison. Absent from a manifest written before they were.
    readonly moving?: readonly Box[] | undefined
    // Absent from a manifest written before it was recorded, which is not
    // known to be a GPU's.
    readonly drawnBy?: DrawnBy | undefined
    readonly before?: Picture | undefined
    readonly diff?: Diff | undefined
    readonly status: Status
    // Why a pull request said this picture changes on purpose, and which
    // one, where one did.
    readonly accepted?: Accepted | undefined
}

export interface Deploy {
    readonly sha: string
    readonly date: string
}

export interface Removed {
    readonly reason: string
    readonly pr?: number | undefined
    readonly ids: readonly string[]
}

export interface Manifest {
    readonly sha: string
    readonly date: string
    readonly format: "ljos-shots"
    readonly version: 1
    readonly repository: string
    // The share of a picture's pixels that may differ before it is
    // called changed.
    readonly threshold: number
    readonly previous?: Deploy | undefined
    readonly gone: readonly string[]
    // Those of the gone that were meant, by the reason given. Optional, as
    // only compare writes it and older manifests don't have it.
    readonly removed?: readonly Removed[] | undefined
    readonly shots: readonly Shot[]
}

export interface Filter {
    readonly status: "all" | "changed" | "broken"
    readonly kernel: "all" | Kernel
    readonly scheme: "all" | Scheme
}

export const everything: Filter = { status: "all", kernel: "all", scheme: "all" }

// The manifest is JSON from outside, so each part is read by what it is.
// A part that may be missing is absent here, whether the JSON left it out
// or wrote null; one that is there and is not what it should be is not a
// part, and so not a manifest this page can read. A reader of a record or
// a list notes what is wrong inside it before its caller notes the whole,
// so the first note is the part itself.
const LIST = "manifest.json"

function miss(bad: string[], at: string): undefined {
    bad.push(at)
    return undefined
}

function refused(said: unknown, read: unknown): boolean {
    return said !== null && said !== undefined && read === undefined
}

function textOf(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined
}

function numberOf(value: unknown): number | undefined {
    return typeof value === "number" ? value : undefined
}

function flagOf(value: unknown): boolean | undefined {
    return typeof value === "boolean" ? value : undefined
}

function kernelOf(value: unknown): Kernel | undefined {
    if (value === "solid") return "solid"
    if (value === "wasm") return "wasm"
    return undefined
}

function gpuOf(value: unknown): Gpu | undefined {
    if (value === "webgpu") return "webgpu"
    if (value === "webgl2") return "webgl2"
    return undefined
}

function apiOf(value: unknown): Api | undefined {
    return value === "webgl" ? "webgl" : gpuOf(value)
}

function schemeOf(value: unknown): Scheme | undefined {
    if (value === "light") return "light"
    if (value === "dark") return "dark"
    return undefined
}

function statusOf(value: unknown): Status | undefined {
    if (value === "same") return "same"
    if (value === "changed") return "changed"
    if (value === "new") return "new"
    if (value === "broken") return "broken"
    return undefined
}

function adapterKindOf(value: unknown): AdapterKind | undefined {
    if (value === "hardware") return "hardware"
    if (value === "software") return "software"
    if (value === "unknown") return "unknown"
    return undefined
}

function textsOf(value: unknown, at: string, bad: string[]): readonly string[] | undefined {
    if (!Array.isArray(value)) return undefined
    const made: string[] = []
    for (const item of value) {
        const here = `${at}[${made.length}]`
        const read = textOf(item)
        if (read === undefined) return miss(bad, here)
        made.push(read)
    }
    return made
}

function viewportOf(value: unknown, at: string, bad: string[]): Viewport | undefined {
    if (typeof value !== "object" || value === null) return undefined
    const name = textOf("name" in value ? value.name : undefined)
    if (name === undefined) return miss(bad, `${at}.name`)
    const width = numberOf("width" in value ? value.width : undefined)
    if (width === undefined) return miss(bad, `${at}.width`)
    const height = numberOf("height" in value ? value.height : undefined)
    if (height === undefined) return miss(bad, `${at}.height`)
    return { name, width, height }
}

function boxOf(value: unknown, at: string, bad: string[]): Box | undefined {
    if (typeof value !== "object" || value === null) return undefined
    const x = numberOf("x" in value ? value.x : undefined)
    if (x === undefined) return miss(bad, `${at}.x`)
    const y = numberOf("y" in value ? value.y : undefined)
    if (y === undefined) return miss(bad, `${at}.y`)
    const width = numberOf("width" in value ? value.width : undefined)
    if (width === undefined) return miss(bad, `${at}.width`)
    const height = numberOf("height" in value ? value.height : undefined)
    if (height === undefined) return miss(bad, `${at}.height`)
    return { x, y, width, height }
}

function boxesOf(value: unknown, at: string, bad: string[]): readonly Box[] | undefined {
    if (!Array.isArray(value)) return undefined
    const made: Box[] = []
    for (const item of value) {
        const here = `${at}[${made.length}]`
        const read = boxOf(item, here, bad)
        if (read === undefined) return miss(bad, here)
        made.push(read)
    }
    return made
}

function pictureOf(value: unknown, at: string, bad: string[]): Picture | undefined {
    if (typeof value !== "object" || value === null) return undefined
    const file = textOf("file" in value ? value.file : undefined)
    if (file === undefined) return miss(bad, `${at}.file`)
    const thumb = textOf("thumb" in value ? value.thumb : undefined)
    if (thumb === undefined) return miss(bad, `${at}.thumb`)
    return { file, thumb }
}

function drawnByOf(value: unknown, at: string, bad: string[]): DrawnBy | undefined {
    if (typeof value !== "object" || value === null) return undefined
    const name = textOf("browser" in value ? value.browser : undefined)
    if (name === undefined) return miss(bad, `${at}.browser`)
    const version = textOf("version" in value ? value.version : undefined)
    if (version === undefined) return miss(bad, `${at}.version`)
    const apiSaid = "api" in value ? value.api : undefined
    const api = apiOf(apiSaid)
    if (refused(apiSaid, api)) return miss(bad, `${at}.api`)
    const adapter = textOf("adapter" in value ? value.adapter : undefined)
    if (adapter === undefined) return miss(bad, `${at}.adapter`)
    const kind = adapterKindOf("kind" in value ? value.kind : undefined)
    if (kind === undefined) return miss(bad, `${at}.kind`)
    return { browser: name, version, api, adapter, kind }
}

function healthOf(value: unknown, at: string, bad: string[]): Health | undefined {
    if (typeof value !== "object" || value === null) return undefined
    const ok = flagOf("ok" in value ? value.ok : undefined)
    if (ok === undefined) return miss(bad, `${at}.ok`)
    const problems = textsOf("problems" in value ? value.problems : undefined, `${at}.problems`, bad)
    if (problems === undefined) return miss(bad, `${at}.problems`)
    return { ok, problems }
}

function diffOf(value: unknown, at: string, bad: string[]): Diff | undefined {
    if (typeof value !== "object" || value === null) return undefined
    const ratio = numberOf("ratio" in value ? value.ratio : undefined)
    if (ratio === undefined) return miss(bad, `${at}.ratio`)
    const fileSaid = "file" in value ? value.file : undefined
    const file = textOf(fileSaid)
    if (refused(fileSaid, file)) return miss(bad, `${at}.file`)
    return { ratio, file }
}

function acceptedOf(value: unknown, at: string, bad: string[]): Accepted | undefined {
    if (typeof value !== "object" || value === null) return undefined
    const reason = textOf("reason" in value ? value.reason : undefined)
    if (reason === undefined) return miss(bad, `${at}.reason`)
    const prSaid = "pr" in value ? value.pr : undefined
    const pr = numberOf(prSaid)
    if (refused(prSaid, pr)) return miss(bad, `${at}.pr`)
    return { reason, pr }
}

function shotOf(value: unknown, at: string, bad: string[]): Shot | undefined {
    if (typeof value !== "object" || value === null) return undefined
    const id = textOf("id" in value ? value.id : undefined)
    if (id === undefined) return miss(bad, `${at}.id`)
    const target = textOf("target" in value ? value.target : undefined)
    if (target === undefined) return miss(bad, `${at}.target`)
    const kind = textOf("kind" in value ? value.kind : undefined)
    if (kind === undefined) return miss(bad, `${at}.kind`)
    const title = textOf("title" in value ? value.title : undefined)
    if (title === undefined) return miss(bad, `${at}.title`)
    const route = textOf("route" in value ? value.route : undefined)
    if (route === undefined) return miss(bad, `${at}.route`)
    const kernel = kernelOf("kernel" in value ? value.kernel : undefined)
    if (kernel === undefined) return miss(bad, `${at}.kernel`)
    const gpuSaid = "gpu" in value ? value.gpu : undefined
    const gpu = gpuOf(gpuSaid)
    if (refused(gpuSaid, gpu)) return miss(bad, `${at}.gpu`)
    const scheme = schemeOf("scheme" in value ? value.scheme : undefined)
    if (scheme === undefined) return miss(bad, `${at}.scheme`)
    const shell = textOf("shell" in value ? value.shell : undefined)
    if (shell === undefined) return miss(bad, `${at}.shell`)
    const viewport = viewportOf("viewport" in value ? value.viewport : undefined, `${at}.viewport`, bad)
    if (viewport === undefined) return miss(bad, `${at}.viewport`)
    const file = textOf("file" in value ? value.file : undefined)
    if (file === undefined) return miss(bad, `${at}.file`)
    const thumb = textOf("thumb" in value ? value.thumb : undefined)
    if (thumb === undefined) return miss(bad, `${at}.thumb`)
    const width = numberOf("width" in value ? value.width : undefined)
    if (width === undefined) return miss(bad, `${at}.width`)
    const height = numberOf("height" in value ? value.height : undefined)
    if (height === undefined) return miss(bad, `${at}.height`)
    const health = healthOf("health" in value ? value.health : undefined, `${at}.health`, bad)
    if (health === undefined) return miss(bad, `${at}.health`)
    const movingSaid = "moving" in value ? value.moving : undefined
    const moving = boxesOf(movingSaid, `${at}.moving`, bad)
    if (refused(movingSaid, moving)) return miss(bad, `${at}.moving`)
    const drawnBySaid = "drawnBy" in value ? value.drawnBy : undefined
    const drawnBy = drawnByOf(drawnBySaid, `${at}.drawnBy`, bad)
    if (refused(drawnBySaid, drawnBy)) return miss(bad, `${at}.drawnBy`)
    const beforeSaid = "before" in value ? value.before : undefined
    const before = pictureOf(beforeSaid, `${at}.before`, bad)
    if (refused(beforeSaid, before)) return miss(bad, `${at}.before`)
    const diffSaid = "diff" in value ? value.diff : undefined
    const diff = diffOf(diffSaid, `${at}.diff`, bad)
    if (refused(diffSaid, diff)) return miss(bad, `${at}.diff`)
    const status = statusOf("status" in value ? value.status : undefined)
    if (status === undefined) return miss(bad, `${at}.status`)
    const acceptedSaid = "accepted" in value ? value.accepted : undefined
    const accepted = acceptedOf(acceptedSaid, `${at}.accepted`, bad)
    if (refused(acceptedSaid, accepted)) return miss(bad, `${at}.accepted`)
    return { id, target, kind, title, route, kernel, gpu, scheme, shell, viewport, file, thumb, width, height, health, moving, drawnBy, before, diff, status, accepted }
}

function shotsOf(value: unknown, at: string, bad: string[]): readonly Shot[] | undefined {
    if (!Array.isArray(value)) return undefined
    const made: Shot[] = []
    for (const item of value) {
        const here = `${at}[${made.length}]`
        const read = shotOf(item, here, bad)
        if (read === undefined) return miss(bad, here)
        made.push(read)
    }
    return made
}

function deployOf(value: unknown, at: string, bad: string[]): Deploy | undefined {
    if (typeof value !== "object" || value === null) return undefined
    const sha = textOf("sha" in value ? value.sha : undefined)
    if (sha === undefined) return miss(bad, `${at}.sha`)
    const date = textOf("date" in value ? value.date : undefined)
    if (date === undefined) return miss(bad, `${at}.date`)
    return { sha, date }
}

function removedOf(value: unknown, at: string, bad: string[]): Removed | undefined {
    if (typeof value !== "object" || value === null) return undefined
    const reason = textOf("reason" in value ? value.reason : undefined)
    if (reason === undefined) return miss(bad, `${at}.reason`)
    const prSaid = "pr" in value ? value.pr : undefined
    const pr = numberOf(prSaid)
    if (refused(prSaid, pr)) return miss(bad, `${at}.pr`)
    const ids = textsOf("ids" in value ? value.ids : undefined, `${at}.ids`, bad)
    if (ids === undefined) return miss(bad, `${at}.ids`)
    return { reason, pr, ids }
}

function removalsOf(value: unknown, at: string, bad: string[]): readonly Removed[] | undefined {
    if (!Array.isArray(value)) return undefined
    const made: Removed[] = []
    for (const item of value) {
        const here = `${at}[${made.length}]`
        const read = removedOf(item, here, bad)
        if (read === undefined) return miss(bad, here)
        made.push(read)
    }
    return made
}

function manifestOf(value: unknown, bad: string[]): Manifest | undefined {
    if (typeof value !== "object" || value === null) return miss(bad, LIST)
    const format = "format" in value ? value.format : undefined
    if (format !== "ljos-shots") return miss(bad, "format")
    const version = "version" in value ? value.version : undefined
    if (version !== 1) return miss(bad, "version")
    const repository = textOf("repository" in value ? value.repository : undefined)
    if (repository === undefined) return miss(bad, "repository")
    const sha = textOf("sha" in value ? value.sha : undefined)
    if (sha === undefined) return miss(bad, "sha")
    const date = textOf("date" in value ? value.date : undefined)
    if (date === undefined) return miss(bad, "date")
    const threshold = numberOf("threshold" in value ? value.threshold : undefined)
    if (threshold === undefined) return miss(bad, "threshold")
    const previousSaid = "previous" in value ? value.previous : undefined
    const previous = deployOf(previousSaid, "previous", bad)
    if (refused(previousSaid, previous)) return miss(bad, "previous")
    const gone = textsOf("gone" in value ? value.gone : undefined, "gone", bad)
    if (gone === undefined) return miss(bad, "gone")
    const removedSaid = "removed" in value ? value.removed : undefined
    const removed = removalsOf(removedSaid, "removed", bad)
    if (refused(removedSaid, removed)) return miss(bad, "removed")
    const shots = shotsOf("shots" in value ? value.shots : undefined, "shots", bad)
    if (shots === undefined) return miss(bad, "shots")
    const read: Manifest = { format: "ljos-shots", version: 1, repository, sha, date, threshold, previous, gone, removed, shots }
    return read
}

// What was found beside the page: a manifest, or the first part of one
// that can't be read, or neither where there is none. A list that can't be
// read is a fault, so it is never taken for none.
export interface Found {
    readonly manifest?: Manifest | undefined
    readonly bad?: string | undefined
}

export function readManifest(value: unknown): Found {
    const bad: string[] = []
    const manifest = manifestOf(value, bad)
    if (manifest !== undefined) return { manifest, bad: undefined }
    return { manifest: undefined, bad: bad[0] ?? LIST }
}

// Only a 404 says the deploy wrote no manifest.
export async function load(address: string): Promise<Found> {
    try {
        const response = await uncached(address)
        if (response.status === 404) return { manifest: undefined, bad: undefined }
        if (!response.ok) return { manifest: undefined, bad: `${LIST} (HTTP ${response.status})` }
        return readManifest(await response.json())
    } catch {
        return { manifest: undefined, bad: LIST }
    }
}

// Whether part of a shot moves on its own, and so was not compared.
export const moves = (shot: Shot): boolean => (shot.moving?.length ?? 0) > 0

export const adapterKind = (shot: Shot): AdapterKind => shot.drawnBy?.kind ?? "unknown"

export const notOnGpu = (shots: readonly Shot[]): number => shots.filter((shot) => adapterKind(shot) !== "hardware").length

// The browser by its name and version: "Chromium 158.0.8127.18".
export function browser(shot: Shot): string {
    if (shot.drawnBy === undefined) return ""
    const { browser: name, version } = shot.drawnBy
    return `${name.slice(0, 1).toUpperCase()}${name.slice(1)} ${version}`
}

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
        const held = at.get(shot.target)
        if (held === undefined) {
            const first: Shot[] = [shot]
            at.set(shot.target, first)
            made.push({ target: shot.target, title: shot.title, kind: shot.kind, route: shot.route, shots: first })
        } else {
            held.push(shot)
        }
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
    return shot.gpu === undefined ? names.kernels[shot.kernel] : `${names.kernels[shot.kernel]}, ${names.gpus[shot.gpu]}`
}

// What a shot is of and how it was taken, as its tile is named: "Svala
// GT: wasm kernel, WebGPU, dark, desktop 1440×900".
export function label(shot: Shot, names: Names = NAMES, schemes: Readonly<Record<Scheme, string>> = { light: "light", dark: "dark" }): string {
    return `${shot.title}: ${renderer(shot, names)}, ${schemes[shot.scheme]}, ${size(shot)}`
}

// A deploy's time as a reader reads it: "20 November 2026, 14:05 UTC".
export function when(iso: string): string {
    const at = timeOf(iso)
    return Number.isNaN(at) ? iso : `${dayText(at)}, ${timeText(at)} UTC`
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

function adapterSaid(shot: Shot): string {
    const name = shot.drawnBy?.adapter || "not recorded"
    const kind = adapterKind(shot)
    if (kind === "hardware") return name
    return `${name} (${kind === "software" ? "software, not a GPU" : "not known, not counted as a GPU"})`
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
        `Browser: ${browser(shot) || "not recorded"}`,
        `Adapter: ${adapterSaid(shot)}`,
        `Scheme: ${shot.scheme}`,
        `Size: ${size(shot)}`,
        `Image: ${at(shot.file)}`,
    ]
    if (shot.before !== undefined) lines.push(`Before: ${at(shot.before.file)}${manifest.previous === undefined ? "" : ` (${manifest.previous.sha.slice(0, 7)})`}`)
    if (shot.diff !== undefined && shot.diff.file !== undefined) lines.push(`Difference: ${at(shot.diff.file)} (${share(shot.diff.ratio)} of pixels)`)
    if (shot.health.problems.length > 0) lines.push(`Problems: ${shot.health.problems.join("; ")}`)
    if (moves(shot)) lines.push("Moving: its moving part was left out of the comparison")
    lines.push("", "What looks wrong:", "")
    const query = queryText({ title: `Screenshot: ${shot.title}, ${renderer(shot)}, ${shot.scheme}, ${shot.viewport.name}`, body: lines.join("\n") })
    return `https://github.com/${manifest.repository}/issues/new?${query}`
}
