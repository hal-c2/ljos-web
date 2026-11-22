// Ljós's Core before QtQuick: only its t`` is wanted here.
import Ljos.Core
import QtQuick
import Site
import "logic/stage.ts" as Stage

// The agent replay's poster: where it ends, drawn by its own parts and
// still, so the page as written, and a reader who asked for less motion,
// has the board the agent turned the list into and the calls that did it
// before anything runs. What each call answered is the
// live stage's to say: the poster's calls have no state, as none of
// them is on its way beside a card that is finished.
AgentView {
    id: poster

    still: true
    playing: false
    total: AgentReplay.steps.length
    at: AgentReplay.steps.length

    Component.onCompleted: {
        const crews = {};
        crews[AgentReplay.uncrewed] = AgentReplay.crew;
        card.heading = AgentReplay.heading;
        card.tickets = AgentReplay.tickets;
        card.filters = AgentReplay.filters;
        card.openOnly = true;
        card.layout = "board";
        card.crews = crews;
        // From the call that reshaped it on, as the end of the log shows them.
        const steps = AgentReplay.steps;
        for (let i = steps.findIndex((step) => step.args.property === "layout"); i < steps.length; i++) {
            const step = steps[i];
            if (step.say !== "")
                log.append({ kind: "say", text: step.say, tool: "", args: "", summary: "", answer: "", image: "" });
            log.append({ kind: "call", text: "", tool: step.tool, args: Stage.argsText(step.args), summary: "", answer: "", image: "" });
        }
    }
}
