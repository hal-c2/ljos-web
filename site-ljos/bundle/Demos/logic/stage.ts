// Pure helpers for the agent replay (AgentStage.qml): what a step sends,
// how its arguments and the inspector's answer read in the log, and the
// card's state written back as the declarative source it amounts to. The
// stage holds the state; nothing here keeps any.

import { keys } from "./keys.mjs"

export interface Step {
    readonly tool: string
    readonly args: Record<string, unknown>
    // What the agent says it is about to do, or "" to go on from the last.
    readonly say: string
    // How long the step stands before the next one starts, in ms.
    readonly wait: number
}

export interface Ticket {
    readonly key: string
    readonly title: string
    readonly state: string
    readonly crew: string
}

// What the inspector answers a call with, read from the client's JSON text.
export interface Answer {
    readonly structured: Record<string, unknown>
    readonly text: string
    readonly image: string
}

// The ref a found control was given, put where a step names `$found`: a
// replay cannot know a handle ahead of the page that mints it.
export function withFound(args: Record<string, unknown>, found: string): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const name of keys(args)) {
        const value = args[name]
        out[name] = value === "$found" ? found : value
    }
    return out
}

// Where a replay goes on from: back to the find before it when the next
// step clicks what was found and the app it was found in is gone (`found`
// cleared), as an agent finds it again in the app that stands now.
export function resumeAt(steps: readonly { tool: string; args: Record<string, unknown> }[], at: number, found: string): number {
    const step = steps[at]
    if (found !== "" || step === undefined) return at
    const args = step.args
    if (!keys(args).some((name) => args[name] === "$found")) return at
    for (let back = at - 1; back >= 0; back--) {
        const before = steps[back]
        if (before !== undefined && before.tool === "app_find") return back
    }
    return at
}

// What `found` is once a step's call has answered: the ref an app_find
// answered with, or none when a swap started while it was on its way (the
// swap counted when it starts, `sentAt` as the call was sent), as the app
// it was found in is gone. Any other answer leaves it as it was.
export function foundAfter(found: string, tool: string, ok: boolean, answer: Answer, sentAt: number, swaps: number): string {
    if (tool !== "app_find" || !ok) return found
    return sentAt === swaps ? refOf(answer) : ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}

// The client's answer text, ok or not: `{structuredContent, content}` when
// the tool answered, `{error: {code, message}}` when it refused.
export function parsed(ok: boolean, text: string): Answer {
    let data: unknown
    try {
        data = JSON.parse(text)
    } catch {
        return { structured: {}, text, image: "" }
    }
    if (!ok) {
        const error = isRecord(data) && isRecord(data.error) ? data.error : {}
        const code = typeof error.code === "string" ? error.code : "error"
        const message = typeof error.message === "string" ? error.message : text
        return { structured: { code, message }, text: `${code}: ${message}`, image: "" }
    }
    const structured = isRecord(data) && isRecord(data.structuredContent) ? data.structuredContent : {}
    const content: unknown[] = isRecord(data) && Array.isArray(data.content) ? data.content : []
    let said = ""
    let image = ""
    for (const part of content) {
        if (!isRecord(part)) continue
        if (part.type === "text" && typeof part.text === "string" && said === "") said = part.text
        if (part.type === "image" && typeof part.data === "string") image = `data:${typeof part.mimeType === "string" ? part.mimeType : "image/png"};base64,${part.data}`
    }
    return { structured, text: said, image }
}

// A value as the log shows it: short, one line, and an array of records as
// how many there are, so a call that sends four tickets reads as one.
export function shown(value: unknown): string {
    if (typeof value === "string") return quoted(value)
    if (Array.isArray(value)) {
        if (value.length > 1 && value.every(isRecord)) return `[${value.length} × {${keys(value[0]).join(", ")}}]`
        return `[${value.map(shown).join(", ")}]`
    }
    if (isRecord(value)) return `{${fieldsText(value)}}`
    return `${value}`
}

// A string in quotes. One whose double quotes are all it would have to
// escape, as a locator's are, stands in single ones, so it reads as written.
function quoted(text: string): string {
    const json = JSON.stringify(text)
    if (!text.includes("\"") || text.includes("'")) return json
    const bare = text.replaceAll("\"", "")
    return JSON.stringify(bare) === `"${bare}"` ? `'${text}'` : json
}

function fieldsText(fields: Record<string, unknown>): string {
    return keys(fields).map((name: string) => `${name}: ${shown(fields[name])}`).join(", ")
}

// A value that may be missing, which reads as null.
function shownOrNull(value: unknown): string {
    return value === null || value === undefined ? "null" : shown(value)
}

// A property's value as the inspector answers it: text already, so not
// quoted again.
function readBack(value: unknown): string {
    return typeof value === "string" ? value : shownOrNull(value)
}

// An array or a record the inspector answered as JSON text, as the value it
// is, so the log shows it as it shows an argument.
function structuredValue(value: unknown): unknown {
    if (typeof value !== "string") return value
    if (!value.startsWith("[") && !value.startsWith("{")) return value
    try {
        return JSON.parse(value)
    } catch {
        return value
    }
}

export function argsText(args: Record<string, unknown>): string {
    if (keys(args).length === 0) return "{}"
    return `{ ${fieldsText(args)} }`
}

function clipped(text: string, most: number): string {
    return text.length > most ? `${text.slice(0, most - 1)}…` : text
}

// What came back, in a few words: what the answer is about, not all of it.
export function summary(tool: string, ok: boolean, answer: Answer): string {
    const s = answer.structured
    if (!ok) return clipped(answer.text, 120)
    switch (tool) {
        case "app_status": {
            const windows: unknown[] = Array.isArray(s.windows) ? s.windows : []
            const front = windows[0]
            const first = isRecord(front) ? front : {}
            return `${String(s.objects ?? 0)} objects · ${Math.round(Number(first.width ?? 0))}×${Math.round(Number(first.height ?? 0))} · ${Array.isArray(s.capabilities) ? s.capabilities.length : 0} tools`
        }
        case "app_objects":
            return `${Array.isArray(s.objects) ? s.objects.length : 0} objects${s.truncated === true ? ", more to come" : ""}`
        case "app_set_property":
            return `${String(s.property)}: ${clipped(shownOrNull(structuredValue(s.previous)), 24)} → ${clipped(shownOrNull(structuredValue(s.value)), 40)}`
        case "app_get_property":
            return `${String(s.property)} = ${clipped(readBack(structuredValue(s.value)), 60)}`
        case "app_find": {
            const matches: unknown[] = Array.isArray(s.matches) ? s.matches : []
            const first = matches[0]
            return isRecord(first) ? `${String(s.count)} match · ${String(first.role)} “${clipped(String(first.name ?? ""), 32)}” → ${String(first.ref)}` : "no match"
        }
        case "app_click":
            return Array.isArray(s.at) ? `clicked at ${s.at.join(", ")}` : answer.text
        case "app_screenshot":
            return `${String(s.width)}×${String(s.height)} PNG`
        default:
            return clipped(answer.text, 120)
    }
}

// The first match's ref: what the next step presses.
export function refOf(answer: Answer): string {
    const matches = answer.structured.matches
    if (!Array.isArray(matches) || !isRecord(matches[0])) return ""
    const ref = matches[0].ref
    return typeof ref === "string" ? ref : ""
}

// How many lines the app's log has: what the next watch waits past.
export function logsCounted(answer: Answer): number {
    const counts = answer.structured.counts
    return isRecord(counts) && typeof counts.logs === "number" ? counts.logs : -1
}

export interface LogEntry {
    readonly seq: number
    readonly message: string
}

export function logEntries(answer: Answer): LogEntry[] {
    const entries = answer.structured.entries
    if (!Array.isArray(entries)) return []
    return entries.filter(isRecord).map((entry: Record<string, unknown>) => ({ seq: Number(entry.seq), message: String(entry.message ?? "") }))
}

export function nextSince(answer: Answer, fallback: number): number {
    const next = answer.structured.next_since
    return typeof next === "number" ? next : fallback
}

// The card as declarative source: what the agent's calls amount to, written
// as a person would have written it.
export function sourceOf(heading: string, filters: readonly string[], tickets: readonly Ticket[], crews: Record<string, string>): string {
    const lines = ["DispatchCard {", `    heading: ${JSON.stringify(heading)}`, `    filters: ${JSON.stringify(filters)}`]
    if (tickets.length === 0) lines.push("    tickets: []")
    else {
        lines.push("    tickets: [")
        for (const ticket of tickets) {
            const crew = crews[ticket.key] ?? ticket.crew
            lines.push(`        { key: ${JSON.stringify(ticket.key)}, state: ${JSON.stringify(ticket.state)}, crew: ${JSON.stringify(crew)},`)
            lines.push(`          title: ${JSON.stringify(ticket.title)} },`)
        }
        lines.push("    ]")
    }
    lines.push("}")
    return lines.join("\n")
}

// An object row of `app_objects`, as the stage's tree lists it.
export interface TreeRow {
    readonly ref: string
    readonly depth: number
    readonly label: string
}

export function treeRows(answer: Answer): TreeRow[] {
    const objects = answer.structured.objects
    if (!Array.isArray(objects)) return []
    return objects.filter(isRecord).map((row: Record<string, unknown>) => {
        const named = typeof row.id === "string" ? `#${row.id}` : typeof row.object_name === "string" ? ` "${row.object_name}"` : ""
        return { ref: String(row.handle ?? ""), depth: Number(row.depth ?? 0), label: `${String(row.type ?? "Object")}${named}` }
    })
}

export interface PropertyRow {
    readonly name: string
    readonly value: string
    readonly mine: boolean
}

export function propertyRows(answer: Answer): PropertyRow[] {
    const properties = answer.structured.properties
    if (!Array.isArray(properties)) return []
    return properties.filter(isRecord).map((row: Record<string, unknown>) => ({
        name: String(row.name ?? ""),
        value: clipped(row.value === null || row.value === undefined ? "null" : String(row.value), 48),
        mine: row.assigned_by === "devtools",
    }))
}
