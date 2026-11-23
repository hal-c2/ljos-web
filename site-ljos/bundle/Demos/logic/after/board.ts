// The board as the replay's edit leaves it: the tickets in two lanes, by
// whether each has a crew. DispatchBoard.qml is built from this file; the
// app starts from logic/before/board.ts, and the edit is the difference.
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
