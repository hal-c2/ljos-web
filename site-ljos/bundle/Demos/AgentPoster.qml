// Ljós's Core before QtQuick: only its t`` is wanted here.
import Ljos.Core
import QtQuick
import Site
import "logic/stage.ts" as Stage

// The agent replay's poster: where it ends, drawn by its own parts and
// still, so the page as written shows the card the agent made and the
// calls that made it before anything runs. What each call answered is the
// live stage's to say: the poster shows the calls as sent.
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
        card.crews = crews;
        // The calls past the tickets, as the end of the log shows them.
        const steps = AgentReplay.steps;
        for (let i = 7; i < steps.length; i++) {
            const step = steps[i];
            if (step.say !== "")
                log.append({ kind: "say", text: step.say, tool: "", args: "", summary: "", answer: "", image: "" });
            log.append({ kind: "call", text: "", tool: step.tool, args: Stage.argsText(step.args), summary: "", answer: "pending", image: "" });
        }
    }
}
