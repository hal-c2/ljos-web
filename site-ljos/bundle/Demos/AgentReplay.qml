pragma Singleton
// Ljós's Core before QtQuick: only its t`` is wanted here.
import Ljos.Core
import QtQuick

// The agent session the landing replays, from the app as a list to the
// same app as a board: each step one MCP tool call, with
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
        { key: "BG-408", title: "West ridge battery test", state: "Closed", crew: "Maren T." },
        { key: "BG-421", title: "Harbour pump meter check", state: "Open", crew: "" }
    ]
    // The app as the agent finds it: a short list, under a plain heading.
    readonly property string startHeading: t`Dispatch`
    readonly property string heading: "North district dispatch"
    readonly property var filters: ["Open only"]
    // The ticket the agent finds without a crew, and gives one.
    readonly property string uncrewed: "BG-415"
    readonly property string crew: t`On-call crew`

    // `$found` is the ref the last app_find answered with.
    readonly property var steps: [
        { tool: "app_status", args: {}, say: t`Check that the app is running.`, wait: 500 },
        { tool: "app_objects", args: { depth: 2 }, say: t`Look at the app before changing it.`, wait: 900 },
        { tool: "app_set_property", args: { target: "#dispatch", property: "heading", value: heading }, say: t`Name the district.`, wait: 800 },
        { tool: "app_set_property", args: { target: "#dispatch", property: "layout", value: "board" }, say: t`Turn the list into a board, without restarting it.`, wait: 1800 },
        { tool: "app_set_property", args: { target: "#dispatch", property: "tickets", value: tickets.slice(0, 3) }, say: t`Bring in the rest of the tickets.`, wait: 450 },
        { tool: "app_set_property", args: { target: "#dispatch", property: "tickets", value: tickets.slice(0, 4) }, say: "", wait: 450 },
        { tool: "app_set_property", args: { target: "#dispatch", property: "tickets", value: tickets }, say: "", wait: 900 },
        { tool: "app_set_property", args: { target: "#dispatch", property: "filters", value: filters }, say: t`Add a filter for open tickets.`, wait: 1000 },
        { tool: "app_find", args: { locator: "role=button[name=\"Open only\"]" }, say: t`Find the filter by its name on screen.`, wait: 1000 },
        { tool: "app_click", args: { target: "$found" }, say: t`Press it, as a person would.`, wait: 1300 },
        { tool: "app_find", args: { locator: `role=button[name="Assign crew to ${uncrewed}"]` }, say: t`Feeder 12 needs a crew. Find its button.`, wait: 1000 },
        { tool: "app_click", args: { target: "$found" }, say: "", wait: 1300 },
        { tool: "app_get_property", args: { target: "#dispatch", property: "unassigned" }, say: t`Check what still needs a crew.`, wait: 1100 },
        { tool: "app_screenshot", args: { max_size: 320 }, say: t`Take a screenshot to check the result.`, wait: 1400 }
    ]
}
