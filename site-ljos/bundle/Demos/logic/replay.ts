// The agent replay's recorded session (AgentReplay.qml) and what the stage
// and its view read of it (AgentStage.qml, AgentView.qml): the steps, the
// states the card can reach, and the inspector session the stage asks.

import type { Crews, Ticket } from "./dispatch.ts"

// A recorded step: an MCP tool call, or, with `edit`, no call but the edit
// of board.ts that makes the app the module of that layout.
export interface ReplayStep {
    readonly tool: string
    readonly edit?: string
    readonly args: Record<string, unknown>
    // What the agent says it is about to do, or "" to go on from the last.
    readonly say: string
    // How long the step stands before the next one starts, in ms.
    readonly wait: number
}

// Whether a step is the edit of board.ts rather than a call.
export function isEdit(step: ReplayStep): boolean {
    return step.edit !== undefined && step.edit !== ""
}

// Where the edit is among the steps, or -1 when none is.
export function firstEdit(steps: readonly ReplayStep[]): number {
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i]
        if (step !== undefined && isEdit(step)) return i
    }
    return -1
}

// A state the card can reach: the crews it was given, its layout, and
// whether it shows open tickets only.
export interface Reachable {
    readonly crews: Crews
    readonly layout: string
    readonly openOnly: boolean
}

// Every state the app's own buttons and the toolbar reach on all its
// tickets: each set of the uncrewed open ones given `crew`, in each layout,
// filtered or not.
export function reachable(tickets: readonly Ticket[], crew: string): readonly Reachable[] {
    const none: readonly Crews[] = [{}]
    const given = tickets.filter((ticket: Ticket) => ticket.state === "Open" && ticket.crew === "").reduce((sets: readonly Crews[], ticket: Ticket) => sets.concat(sets.map((set: Crews) => {
        const next: Record<string, string> = { ...set }
        next[ticket.key] = crew
        return next
    })), none)
    const states: Reachable[] = []
    for (const crews of given) {
        for (const layout of ["list", "board"]) {
            for (const openOnly of [false, true]) states.push({ crews: crews, layout: layout, openOnly: openOnly })
        }
    }
    return states
}

// One of the view's tabs.
export interface Tab {
    readonly key: string
    readonly name: string
}

// A line of the phone's strip of code (DispatchSource's `strip`).
export interface StripLine {
    readonly line: number
    readonly text: string
}

// The inspector's client the stage asks (ljos-web's InspectorSession),
// fetched by its path, so its type is only what the stage reads of it.
export interface Session {
    readonly tokenFile: string
    call(tool: string, args: string): number
}

export function isSession(value: unknown): value is Session {
    return typeof value === "object" && value !== null && "tokenFile" in value && typeof value.tokenFile === "string"
        && "call" in value && typeof value.call === "function"
}

// Whether a swap reloaded the app: it answers why it failed, or nothing.
export function swapped(why: unknown): boolean {
    return why === undefined || why === null || why === ""
}

// A row of the agent's log, as the stage adds it: what it is, and only the
// fields it has; the rest stay "".
export interface LogFields {
    readonly kind: string
    readonly text?: string
    readonly tool?: string
    readonly args?: string
    readonly summary?: string
    readonly answer?: string
    readonly image?: string
}

// Why a swap failed, as the log says it.
export function reason(why: unknown): string {
    return typeof why === "string" ? why : `${why}`
}
