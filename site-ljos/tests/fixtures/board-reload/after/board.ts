export interface Ticket {
    readonly crew: string
}
export interface Lane {
    readonly title: string
    readonly tickets: readonly Ticket[]
}

const free = (t: Ticket): boolean => t.crew === ""
const busy = (t: Ticket): boolean => t.crew !== ""

export function lanes(
    tickets: readonly Ticket[],
): readonly Lane[] {
    return [{
        title: "Needs a crew",
        tickets: tickets.filter(free),
    }, {
        title: "Crew assigned",
        tickets: tickets.filter(busy),
    }]
}
