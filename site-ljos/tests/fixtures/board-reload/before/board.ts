export interface Ticket {
    readonly crew: string
}
export interface Lane {
    readonly title: string
    readonly tickets: readonly Ticket[]
}

export function lanes(
    tickets: readonly Ticket[],
): readonly Lane[] {
    return [{ title: "", tickets }]
}
