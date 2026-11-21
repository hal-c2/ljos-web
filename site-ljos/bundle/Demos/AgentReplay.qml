pragma Singleton
// Ljós's Core before QtQuick: only its t`` is wanted here.
import Ljos.Core
import QtQuick

// The agent session the landing replays: each step one MCP tool call, with
// the arguments a coding agent sent the dispatch card's inspector. The
// replay sends them for real, to the card on the page, so what the log
// shows is what the page's inspector answered; only the agent's choice of
// call is recorded, no model is asked. The tickets are made up, for a made
// up grid operator.
QtObject {
    readonly property var tickets: [
        { key: "BG-412", title: "Substation Nord-4 transformer fan alert", state: "Open", crew: "Katrín S." },
        { key: "BG-415", title: "Feeder 12 voltage sag log", state: "Open", crew: "" },
        { key: "BG-419", title: "Quay relay cabinet door sensor", state: "Open", crew: "Emil R." },
        { key: "BG-408", title: "West ridge battery test", state: "Closed", crew: "Maren T." }
    ]
    readonly property string heading: "North district dispatch"
    readonly property var filters: ["Open only"]
    // The ticket the agent finds without a crew, and gives one.
    readonly property string uncrewed: "BG-415"
    readonly property string crew: t`On-call crew`

    // `$found` is the ref the last app_find answered with.
    readonly property var steps: [
        { tool: "app_status", args: {}, say: t`Is the app up, and what can I do to it?`, wait: 1100 },
        { tool: "app_objects", args: { depth: 2 }, say: t`Read the live tree before touching anything.`, wait: 1100 },
        { tool: "app_set_property", args: { target: "#dispatch", property: "heading", value: heading }, say: t`The window is empty. Give it a heading.`, wait: 1200 },
        { tool: "app_set_property", args: { target: "#dispatch", property: "tickets", value: tickets.slice(0, 1) }, say: t`Stream the tickets in, one call each.`, wait: 450 },
        { tool: "app_set_property", args: { target: "#dispatch", property: "tickets", value: tickets.slice(0, 2) }, say: "", wait: 450 },
        { tool: "app_set_property", args: { target: "#dispatch", property: "tickets", value: tickets.slice(0, 3) }, say: "", wait: 450 },
        { tool: "app_set_property", args: { target: "#dispatch", property: "tickets", value: tickets }, say: "", wait: 1100 },
        { tool: "app_set_property", args: { target: "#dispatch", property: "filters", value: filters }, say: t`Offer a filter. The card draws the button itself, from data.`, wait: 1200 },
        { tool: "app_find", args: { locator: "role=button[name=\"Open only\"]" }, say: t`Find the filter the way a screen reader hears it.`, wait: 1000 },
        { tool: "app_click", args: { target: "$found" }, say: t`Press it, where a person's pointer would land.`, wait: 1300 },
        { tool: "app_find", args: { locator: `role=button[name="Assign crew to ${uncrewed}"]` }, say: t`One open ticket has no crew. Find its button by role and name.`, wait: 1000 },
        { tool: "app_click", args: { target: "$found" }, say: "", wait: 1300 },
        { tool: "app_get_property", args: { target: "#dispatch", property: "unassigned" }, say: t`Check the app agrees: no open ticket is left without a crew.`, wait: 1100 },
        { tool: "app_screenshot", args: { max_size: 320 }, say: t`Look at what a person sees now.`, wait: 1400 }
    ]
}
