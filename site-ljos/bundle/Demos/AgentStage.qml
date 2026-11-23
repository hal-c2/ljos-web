// Ljós's Core before QtQuick: only its t`` is wanted here, and a name
// both have (Timer) stays QtQuick's, the later import.
import Ljos.Core
import QtQuick
import Site
import "logic/stage.ts" as Stage
import "../observed.js" as Observed
import "later.js" as Later

// The agent replay, live: each recorded step is sent as the MCP tool call
// it was, through an inspector's client, to an inspector serving the dispatch
// card on this page, the same inspector `ljos observe` and a coding agent
// ask. What the log says each call answered is what the card's inspector
// answered here. The agent's edit of board.ts is recorded: the stage
// reloads the running app from the module the build made of the edited
// file, and the log says what that reload did. What the card does (a press of the reader's, or one of
// the agent's) is said in its log, and streams back into the agent's log
// through app_watch and app_logs, as it would to an agent.
//
// It runs only while its stage does (`active`), and at its end nothing is
// left scheduled: the app's log is asked after each thing the app says,
// never waited on.
AgentView {
    id: stage

    property bool active: false
    readonly property var observed: card
    // The card's log, for the Observer the stage's toolbar opens.
    readonly property var logs: Observed.logSource(key)
    readonly property string key: "agent-" + Math.floor(Math.random() * 1e9)

    total: AgentReplay.steps.length
    playing: true
    working: active && playing
    // Its button then plays it again, rather than on.
    readonly property bool ended: at >= total
    // The frame keeps the poster until the app has come (DemoFrame's
    // `drawn`), and not again: a swap of modules takes the old app away
    // just before it puts the new one in.
    readonly property bool ready: seeded
    Component.onCompleted: reset()

    // The app the replay starts from, given to the first card made as the
    // program's own assignments: a reload carries those, where it would
    // take what a file declares from the new module.
    property bool seeded: false
    onCardChanged: {
        if (card !== null && !seeded) {
            seed();
            seeded = true;
        }
    }
    function seed() {
        card.heading = AgentReplay.heading;
        card.tickets = AgentReplay.tickets;
        card.filters = AgentReplay.filters;
        card.openOnly = false;
        card.crews = {};
        card.picked = "";
        card.seen = {};
    }

    // The ref the last app_find answered.
    property string found: ""
    // The call of a step on its way, by its serial; -1 when none is.
    property int stepSerial: -1
    property int stepRow: -1
    // The app spoke while its log was being read: read it again after.
    property bool owed: false
    // The app's log: how many lines it had at the last watch, and which
    // line the next app_logs starts at. -1 until the first watch says.
    property int logsSeen: -1
    property int logSince: 0
    property int watchSerial: -1
    property int logsSerial: -1
    property int treeSerial: -1
    property int inspectSerial: -1
    // A swap of the app's module on its way.
    property bool swapping: false
    readonly property bool busy: stepSerial >= 0 || swapping
    readonly property string inspectedAs: t`Dispatch`
    // The card's inspector's, empty until it is fetched and serves.
    readonly property string tokenFile: held.item ? held.item.tokenFile : ""
    onTokenFileChanged: {
        listen();
        // Its tab can be picked before the inspector has come.
        if (tab === "observer")
            readTree();
    }

    function ask(tool, args) {
        return held.item ? held.item.call(tool, args) : -1;
    }

    function row(fields) {
        log.append(Object.assign({ kind: "say", text: "", tool: "", args: "", summary: "", answer: "", image: "" }, fields));
        return log.count - 1;
    }

    function step() {
        if (busy || at >= total || tokenFile === "")
            return;
        const next = AgentReplay.steps[at];
        if (next.say !== "")
            row({ kind: "say", text: next.say });
        if (next.edit) {
            edit(next.edit);
            return;
        }
        const args = Stage.withFound(next.args, found);
        stepRow = row({ kind: "call", tool: next.tool, args: Stage.argsText(args), answer: "pending" });
        stepSerial = ask(next.tool, JSON.stringify(args));
    }

    // The agent's edit of board.ts: the running app reloaded from the
    // module built from the edited file, as a save does under `--watch`.
    function edit(layout) {
        stepRow = row({ kind: "edit", tool: "board.ts", args: AgentReplay.editText(running, layout), answer: "pending" });
        swapping = true;
        swap(layout).then((why) => {
            stage.swapping = false;
            log.setProperty(stage.stepRow, "answer", why ? "error" : "ok");
            log.setProperty(stage.stepRow, "summary", why ? why : t`the app runs the module built from it now`);
            stage.advance();
        });
    }

    // Back to the app the replay starts from: its tickets, in a list.
    function reset() {
        stepSerial = -1;
        stepRow = -1;
        found = "";
        at = 0;
        edited = false;
        log.clear();
        pickedRef = "";
        propertyRows = [];
        if (card !== null)
            seed();
        if (running !== "list") {
            swapping = true;
            swap("list").then(() => {
                stage.swapping = false;
            });
        }
    }

    // The frame's Play: from the start once it has ended, else on from
    // where the reader took over.
    function play() {
        if (at >= total)
            reset();
        edited = false;
        playing = true;
    }
    // The reader's own swap to either module: the agent's edit undone or
    // made again. It takes the replay's place, or the next step would be
    // theirs to fight.
    onLayoutPicked: (picked) => {
        if (picked === running || swapping)
            return;
        playing = false;
        edited = true;
        swapping = true;
        swap(picked).then((why) => {
            stage.swapping = false;
            if (!why)
                stage.tell(`layout changed to ${picked}`);
        });
    }
    onTabPicked: (picked) => {
        tab = picked;
        if (picked === "observer")
            readTree();
    }
    onTreePicked: (ref) => {
        pickedRef = ref;
        inspectSerial = ask("app_inspect", JSON.stringify({ target: ref }));
    }

    function readTree() {
        if (tokenFile !== "" && treeSerial < 0)
            treeSerial = ask("app_objects", JSON.stringify({ depth: 6 }));
    }

    function tell(line) {
        Observed.say(key, "info", line);
        listen();
    }

    // The app's log, as an agent reads it: how much it has said, then
    // those lines. app_watch without `since` answers at once and sets no
    // timer, so it is asked when there is something to hear, one at a time.
    function listen() {
        if (!active || tokenFile === "")
            return;
        if (watchSerial >= 0 || logsSerial >= 0) {
            owed = true;
            return;
        }
        owed = false;
        watchSerial = ask("app_watch", "{}");
    }
    onActiveChanged: listen()

    function answered(serial, tool, ok, result) {
        const answer = Stage.parsed(ok, result);
        if (serial === watchSerial) {
            watchSerial = -1;
            const counted = Stage.logsCounted(answer);
            if (logsSeen < 0) {
                logSince = counted;
                logsSeen = counted;
            } else if (counted > logsSeen) {
                logsSeen = counted;
                logsSerial = ask("app_logs", JSON.stringify({ since: logSince, limit: 20 }));
                return;
            }
            if (owed)
                listen();
            return;
        }
        if (serial === logsSerial) {
            logsSerial = -1;
            Stage.logEntries(answer).forEach((entry) => row({ kind: "event", text: entry.message }));
            logSince = Stage.nextSince(answer, logSince);
            if (owed)
                listen();
            return;
        }
        if (serial === treeSerial) {
            treeSerial = -1;
            if (ok)
                treeRows = Stage.treeRows(answer);
            return;
        }
        if (serial === inspectSerial) {
            inspectSerial = -1;
            if (ok)
                propertyRows = Stage.propertyRows(answer);
            return;
        }
        if (serial !== stepSerial)
            return;
        stepSerial = -1;
        log.setProperty(stepRow, "answer", ok ? "ok" : "error");
        log.setProperty(stepRow, "summary", Stage.summary(tool, ok, answer));
        if (answer.image !== "")
            log.setProperty(stepRow, "image", answer.image);
        if (tool === "app_find" && ok)
            found = Stage.refOf(answer);
        advance();
    }

    // The step done: on to the next, or the reader's turn.
    function advance() {
        at = at + 1;
        if (at >= total) {
            playing = false;
            row({ kind: "end", text: t`Your turn: try any button in the app and watch this log.` });
        }
        if (tab === "observer") {
            readTree();
            if (pickedRef !== "")
                inspectSerial = ask("app_inspect", JSON.stringify({ target: pickedRef }));
        }
    }

    // Fetched by its path: Ljós's checker knows no type only the web has.
    Loader {
        id: held
        visible: false
        source: Later.inspectorSession
        onLoaded: {
            item.clientName = "replay";
            // The log and title before the target: the target is served
            // with what it is given then.
            item.logs = Qt.binding(() => stage.logs);
            item.title = Qt.binding(() => stage.inspectedAs);
            item.target = Qt.binding(() => stage.card);
        }
    }
    Connections {
        target: held.item
        function onAnswered(serial, tool, ok, result) {
            stage.answered(serial, tool, ok, result);
        }
    }

    Connections {
        target: stage.card
        function onTold(line) {
            stage.tell(line);
        }
    }

    // The replay's beat: each step stands for as long as it was given,
    // also for a reader who asked for less motion, who is moved less but
    // shown each step.
    Timer {
        id: beat
        interval: stage.at > 0 ? AgentReplay.steps[stage.at - 1].wait : 700
        running: stage.active && !stage.busy && stage.at < stage.total && stage.playing && stage.tokenFile !== ""
        onTriggered: stage.step()
    }

    Component.onDestruction: Observed.forget(key)
}
