// The app calls this each time its layout changes.
export type Layout = "list" | "board"

export interface Ticket {
    readonly crew: string
}
export interface Lane {
    readonly title: string
    readonly tickets: readonly Ticket[]
}

export function lanes(
    layout: Layout,
    tickets: readonly Ticket[],
): readonly Lane[] {
    if (layout === "list")
        return [{ title: "", tickets }]

    const free = (t: Ticket) => t.crew === ""
    const busy = (t: Ticket) => t.crew !== ""
    return [
        { title: "Needs a crew",
          tickets: tickets.filter(free) },
        { title: "Crew assigned",
          tickets: tickets.filter(busy) },
    ]
}
