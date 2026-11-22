// The rules of the agent-built replay (AgentBuiltDemo.qml): which file
// stands at a step, what of it changed, and when the player moves on.
// The steps themselves are the recording's (session.ts).

// A change an edit made, in the file's own characters.
export interface Change {
    readonly start: number
    readonly end: number
    readonly replacement: string
}

// The file as it stands after the first `version` edits.
export function sourceAt(before: string, edits: readonly (readonly Change[])[], version: number): string {
    let text = before
    for (const changes of edits.slice(0, Math.max(0, version))) {
        // From the end, so each change's offsets still hold.
        for (const change of [...changes].sort((a: Change, b: Change) => b.start - a.start))
            text = text.slice(0, change.start) + change.replacement + text.slice(change.end)
    }
    return text
}

// The lines, counted from 1, that edit `version` wrote, in the file as
// it stands after it: [first, last], or [0, -1] before any edit.
export function changedLines(before: string, edits: readonly (readonly Change[])[], version: number): readonly number[] {
    if (version < 1 || version > edits.length)
        return [0, -1]
    const after = sourceAt(before, edits, version)
    let shift = 0
    let first = Number.MAX_SAFE_INTEGER
    let last = -1
    for (const change of [...edits[version - 1]].sort((a: Change, b: Change) => a.start - b.start)) {
        const at = change.start + shift
        // A replacement that ends its line ends on that line, not the next.
        const body = change.replacement.endsWith("\n") ? change.replacement.slice(0, -1) : change.replacement
        first = Math.min(first, lineOf(after, at))
        last = Math.max(last, lineOf(after, at + body.length))
        shift += change.replacement.length - (change.end - change.start)
    }
    return [first, last]
}

function lineOf(text: string, offset: number): number {
    return text.slice(0, offset).split("\n").length
}

// What of a file to show round lines [from, to]: `around` lines either
// side, every line when nothing changed yet.
export function excerpt(text: string, from: number, to: number, around: number): { readonly first: number; readonly lines: readonly string[] } {
    const lines = text.split("\n")
    if (to < from)
        return { first: 1, lines }
    const first = Math.max(1, from - around)
    const last = Math.min(lines.length, to + around)
    return { first, lines: lines.slice(first - 1, last) }
}

// How long the player stays on a step before the next, by how much
// there is to read in it.
export function dwell(lines: number): number {
    return Math.min(6000, 2200 + 140 * Math.min(lines, 26))
}

// A step's index kept to the session: 0 is before the first call.
export function clamp(step: number, total: number): number {
    return Math.max(0, Math.min(total, Math.round(step)))
}

// The literal a QML file gives a property (`property color ink: "#d97706"`),
// or "" where it binds it to something else.
export function literalOf(text: string, name: string): string {
    return text.split("\n").map((line) => literalOn(line, name)).find((value) => value !== undefined) ?? ""
}

// The literal on one line of the form `property <type> <name>: "<value>"`.
function literalOn(line: string, name: string): string | undefined {
    const at = line.indexOf("property ")
    if (at < 0) return undefined
    const typed = line.slice(at + "property ".length)
    const space = typed.indexOf(" ")
    if (space <= 0) return undefined
    const head = `${name}: "`
    const rest = typed.slice(space + 1)
    if (!rest.startsWith(head)) return undefined
    const value = rest.slice(head.length)
    const end = value.indexOf('"')
    return end < 0 ? undefined : value.slice(0, end)
}
