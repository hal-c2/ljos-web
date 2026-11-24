// The dispatch card's data (DispatchCard.qml): its tickets, the crews given
// here, and the lanes a board module lays them in. An agent sets these over
// MCP as plain JSON, so the types are what the card reads, not a promise of
// what it is sent.

export interface Ticket {
    readonly key: string
    readonly title: string
    readonly state: string
    readonly crew: string
}

export interface Lane {
    readonly title: string
    readonly tickets: readonly Ticket[]
}

// The crew each ticket was given here, by its key.
export type Crews = Readonly<Record<string, string>>

// Where rows already stood, by the place a row stood in.
export type Seen = Record<string, boolean>

// What a board module's `lanes` lays out (logic/before/board.ts and
// logic/after/board.ts): it sees the crew of each ticket and nothing more,
// and hands back the tickets it was given.
export interface LaidLane {
    readonly title: string
    readonly tickets: readonly { readonly crew: string }[]
}
export type Lay = (tickets: readonly Ticket[]) => readonly LaidLane[]
// A card with no board module lays its tickets out as one list.
export type MaybeLay = Lay | undefined

function isTicket(value: Ticket | undefined): value is Ticket {
    return value !== undefined
}

// The lanes, with the tickets each holds as the card gave them: a board
// module hands back the very tickets it was given, in its own order, so
// each is found again among those, and nothing else is.
export function laid(lay: MaybeLay, placed: readonly Ticket[]): readonly Lane[] {
    if (lay === undefined) return [{ title: "", tickets: placed }]
    return lay(placed).map((lane: LaidLane): Lane => ({
        title: lane.title,
        tickets: lane.tickets.map((ticket: { readonly crew: string }) => placed.find((given: Ticket) => given === ticket)).filter(isTicket),
    }))
}
