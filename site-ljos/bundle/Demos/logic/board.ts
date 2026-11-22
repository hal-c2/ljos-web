// The app calls this each time its layout changes.
export type Layout = "list" | "board"

export interface Ticket {
    readonly crew: string
}
export interface Lane {
    readonly title: string
    readonly tickets: readonly Ticket[]
}

const free = (t: Ticket): boolean => t.crew === ""
const busy = (t: Ticket): boolean => t.crew !== ""

// From here on is what the front page shows: keep it 39 columns or fewer.
export function lanes(
    layout: Layout,
    tickets: readonly Ticket[],
): readonly Lane[] {
    if (layout === "list")
        return [{ title: "", tickets }]

    return [{
        title: "Needs a crew",
        tickets: tickets.filter(free),
    }, {
        title: "Crew assigned",
        tickets: tickets.filter(busy),
    }]
}
