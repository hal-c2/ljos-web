pragma Singleton
// Ljós's Core before QtQuick: only its t`` is wanted here.
import Ljos.Core
import QtQuick
import Site

// The agent session the landing replays, from the app as a list to the
// same app as a board: each step an MCP tool call, with the arguments a
// coding agent sent the dispatch card's inspector, or the agent's edit of
// board.ts. The replay sends the calls for real, to the card on the page,
// so what the log shows is what the page's inspector answered. The edit
// is recorded: the site's build has both versions of board.ts as modules,
// and the replay reloads the running card from the edited one's, which
// keeps what the card was given. Only the agent's choices are recorded,
// no model is asked. The tickets are made up, for a made up grid operator.
QtObject {
    readonly property var tickets: [
        { key: "BG-412", title: "Substation Nord-4 transformer fan alert", state: "Open", crew: "Katrín S." },
        { key: "BG-415", title: "Feeder 12 voltage sag log", state: "Open", crew: "" },
        { key: "BG-419", title: "Quay relay cabinet door sensor", state: "Open", crew: "Emil R." },
        { key: "BG-408", title: "West ridge battery test", state: "Closed", crew: "Maren T." },
        { key: "BG-421", title: "Harbour pump meter check", state: "Open", crew: "" }
    ]
    readonly property string heading: "North district dispatch"
    readonly property var filters: ["Open only"]
    // The ticket the agent finds without a crew, and gives one.
    readonly property string uncrewed: "BG-415"
    readonly property string crew: t`On-call crew`
    // Every state the app's own buttons and the toolbar reach on all its
    // tickets: each set of them given a crew, in each layout, filtered or
    // not.
    readonly property var reachable: {
        const given = tickets.filter((ticket) => ticket.state === "Open" && ticket.crew === "").reduce((sets, ticket) => sets.concat(sets.map((set) => {
            const next = Object.assign({}, set);
            next[ticket.key] = crew;
            return next;
        })), [{}]);
        const states = [];
        given.forEach((crews) => ["list", "board"].forEach((layout) => [false, true].forEach((openOnly) => states.push({ crews: crews, layout: layout, openOnly: openOnly }))));
        return states;
    }

    // `$found` is the ref the last app_find answered with. A step with
    // `edit` is no call: it is the edit of board.ts that makes the app the
    // module of that layout.
    readonly property var steps: [
        { tool: "app_status", args: {}, say: t`Check that the app is running.`, wait: 500 },
        { tool: "app_objects", args: { depth: 2 }, say: t`Look at the app before changing it.`, wait: 900 },
        { tool: "app_find", args: { locator: `role=button[name="Assign crew to ${uncrewed}"]` }, say: t`Feeder 12 needs a crew. Find its button.`, wait: 1000 },
        { tool: "app_click", args: { target: "$found" }, say: t`Press it, as a person would.`, wait: 1300 },
        { tool: "", edit: "board", args: {}, say: t`Make the list a board: edit board.ts.`, wait: 1800 },
        { tool: "app_get_property", args: { target: "#dispatch", property: "crews" }, say: t`Check that Feeder 12 kept its crew.`, wait: 1100 },
        { tool: "app_get_property", args: { target: "#dispatch", property: "unassigned" }, say: t`Check what still needs a crew.`, wait: 1100 },
        { tool: "app_screenshot", args: { max_size: 320 }, say: t`Take a screenshot to check the result.`, wait: 1400 }
    ]
    readonly property int calls: steps.filter((step) => step.tool !== "").length

    // How the replay lays out (AgentView), for the page that places it
    // too: the code's column, the room round the app and between them,
    // and the narrowest the code stands beside the app in, where the app
    // keeps its filters by its heading and the code its 14 pixels.
    readonly property int sideWidth: 358
    readonly property int pad: Theme.xxs
    readonly property int gap: Theme.s
    readonly property int sideBySide: sideWidth + 360 + gap + 2 * pad

    // The edit of board.ts from one module's file to the other's, as a
    // diff's lines: what was taken out, then what was put in.
    function editText(from, to) {
        return DispatchSource[from].said.map((line) => "- " + line).concat(DispatchSource[to].said.map((line) => "+ " + line)).join("\n");
    }
}
