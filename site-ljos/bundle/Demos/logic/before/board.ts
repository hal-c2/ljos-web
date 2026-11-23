// The board as the app starts: every ticket in one list, in its order.
// DispatchList.qml is built from this file; the replay's edit turns it
// into logic/after/board.ts.
export interface Ticket {
    readonly crew: string
}
export interface Lane {
    readonly title: string
    readonly tickets: readonly Ticket[]
}

// From here on is what the front page shows: keep it 39 columns or fewer.
export function lanes(
    tickets: readonly Ticket[],
): readonly Lane[] {
    return [{ title: "", tickets }]
}
