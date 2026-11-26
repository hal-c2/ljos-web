// Brekka Grid's open work, a made-up grid operator's: each ticket, who
// is on it, and which of them the card shows. The card holds the state
// (who is assigned, whether only open tickets show); these are the rules.

export type Status = "open" | "closed"

export interface Ticket {
    readonly id: string
    readonly title: string
    readonly site: string
    readonly status: Status
    readonly crew: string
}

export const crews: readonly string[] = ["Unassigned", "Katrín S.", "Emil R.", "Maren T.", "Jónas B."]

export const all: readonly Ticket[] = [
    { id: "BG-419", title: "Relay cabinet door sensor", site: "Quay", status: "open", crew: "Emil R." },
    { id: "BG-415", title: "Voltage sag log", site: "Feeder 12", status: "open", crew: "Unassigned" },
    { id: "BG-412", title: "Transformer fan alert", site: "Substation Nord-4", status: "open", crew: "Katrín S." },
    { id: "BG-408", title: "Battery test", site: "West ridge", status: "closed", crew: "Maren T." },
    { id: "BG-404", title: "Meter seal check", site: "Harbour row", status: "closed", crew: "Jónas B." },
    { id: "BG-401", title: "Vegetation clearance", site: "Line 7, span 31", status: "closed", crew: "Emil R." },
]

// Whether a ticket stands in the list: every one, or with `openOnly`
// only those still open.
export function shows(ticket: Ticket, openOnly: boolean): boolean {
    return !openOnly || ticket.status === "open"
}

export function count(tickets: readonly Ticket[], openOnly: boolean): number {
    return tickets.filter((t: Ticket) => shows(t, openOnly)).length
}

// Where a crew stands in `crews`, so a picker starts on the one assigned.
export function crewIndex(crew: string): number {
    const at = crews.indexOf(crew)
    return at < 0 ? 0 : at
}

// What the card logs when a reader assigns a crew: the line an agent
// following the app with `app_watch` and `app_logs` reads.
export function assigned(ticket: Ticket, crew: string): string {
    return crew === crews[0] ? `${ticket.id} unassigned` : `${ticket.id} assigned to ${crew}`
}
