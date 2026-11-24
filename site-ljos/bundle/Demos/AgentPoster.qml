import Ljos.Ui
import Ljos.Core
import Site
import "../nav.js" as Nav
import "logic/stage.ts" as Stage

// The agent replay's poster: where it ends, drawn by its own parts and
// still, so the page as written, and a reader who asked for less motion,
// has the board the agent's edit made of the list, the code it was built
// from and the steps that did it before anything runs. The board is the
// board module's, the view's loader shows it before it has a source.
// What each call answered is the live stage's to say: the poster's
// calls have no state, as none of them is on its way beside an app that
// is finished.
AgentView {
    id: poster

    still: true
    playing: false
    // The finished board is the reader's to change before anything plays,
    // and where they asked that nothing play.
    editable: awake
    property bool awake: false
    total: AgentReplay.steps.length
    at: AgentReplay.steps.length

    Timer {
        interval: 0
        running: Nav.inBrowser()
        onTriggered: poster.awake = true
    }
    // The reader's List / Board: the edit undone or made again, by the
    // same swap of modules the replay makes.
    onLayoutPicked: (picked) => {
        if (picked === running)
            return;
        edited = true;
        swap(picked);
    }

    // The end state, given to the first board shown as the program's own
    // assignments, which a swap carries to the other module.
    property bool seeded: false
    onCardChanged: {
        if (card === null || seeded)
            return;
        seeded = true;
        const crews = {};
        crews[AgentReplay.uncrewed] = AgentReplay.crew;
        card.heading = AgentReplay.heading;
        card.tickets = AgentReplay.tickets;
        card.filters = AgentReplay.filters;
        card.openOnly = false;
        card.crews = crews;
    }

    Component.onCompleted: {
        // From the edit that reshaped it on, as the end of the log shows them.
        const steps = AgentReplay.steps;
        for (let i = steps.findIndex((step) => !!step.edit); i < steps.length; i++) {
            const step = steps[i];
            if (step.say !== "")
                log.append({ kind: "say", text: step.say, tool: "", args: "", summary: "", answer: "", image: "" });
            if (step.edit)
                log.append({ kind: "edit", text: "", tool: "board.ts", args: AgentReplay.editText("list", step.edit), summary: "", answer: "", image: "" });
            else
                log.append({ kind: "call", text: "", tool: step.tool, args: Stage.argsText(step.args), summary: "", answer: "", image: "" });
        }
    }
}
