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
// answered here. What the card does (a press of the reader's, or one of
// the agent's) is said in its log, and streams back into the agent's log
// through app_watch and app_logs, as it would to an agent.
//
// It runs only while its stage does (`active`): a watch out when it stops
// is answered by its own timeout and not asked again.
AgentView {
    id: stage

    property bool active: false
    readonly property var observed: card
    // The card's log, for the Observer the stage's toolbar opens.
    readonly property var logs: Observed.logSource(key)
    readonly property string key: "agent-" + Math.floor(Math.random() * 1e9)

    total: AgentReplay.steps.length
    playing: true
    Component.onCompleted: reset()

    // The ref the last app_find answered.
    property string found: ""
    // The call of a step on its way, by its serial; -1 when none is.
    property int stepSerial: -1
    property int stepRow: -1
    // Where `previous` replays to, fast: -1 when it does not.
    property int fastTo: -1
    // The app's log: how many lines it had at the last watch, and which
    // line the next app_logs starts at. -1 until the first watch says.
    property int logsSeen: -1
    property int logSince: 0
    property int watchSerial: -1
    property int logsSerial: -1
    property int treeSerial: -1
    property int inspectSerial: -1
    readonly property bool busy: stepSerial >= 0
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
        const args = Stage.withFound(next.args, found);
        stepRow = row({ kind: "call", tool: next.tool, args: Stage.argsText(args), answer: "pending" });
        stepSerial = ask(next.tool, JSON.stringify(args));
    }

    // Back to the app the replay starts from: its tickets, in a list.
    function reset() {
        stepSerial = -1;
        stepRow = -1;
        found = "";
        at = 0;
        card.heading = AgentReplay.heading;
        card.tickets = AgentReplay.tickets;
        card.filters = AgentReplay.filters;
        card.layout = "list";
        card.openOnly = false;
        card.crews = {};
        card.picked = "";
        card.seen = {};
        log.clear();
        pickedRef = "";
        propertyRows = [];
    }

    onPlay: {
        if (at >= total)
            reset();
        playing = true;
    }
    onPause: playing = false
    onNext: {
        playing = false;
        step();
    }
    onPrevious: {
        // Calls cannot be taken back one by one: the card goes back to
        // where it started and the steps before are sent again, at once.
        const to = Math.max(0, at - 1);
        playing = false;
        reset();
        fastTo = to > 0 ? to : -1;
    }
    onRestart: {
        reset();
        fastTo = -1;
        playing = true;
    }
    // The reader's own edit of what the agent's call sets. It takes the
    // replay's place, or the next call would be theirs to fight.
    onLayoutPicked: (picked) => {
        if (picked === card.layout)
            return;
        playing = false;
        card.layout = picked;
        Observed.say(key, "info", `layout changed to ${picked}`);
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

    // The app's log, as an agent follows it: one watch out at a time,
    // which answers once the app has said more.
    function listen() {
        if (!active || watchSerial >= 0 || logsSerial >= 0 || tokenFile === "")
            return;
        const args = logsSeen < 0 ? {} : { since: { logs: logsSeen }, wait_ms: 30000, holder: key };
        watchSerial = ask("app_watch", JSON.stringify(args));
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
            listen();
            return;
        }
        if (serial === logsSerial) {
            logsSerial = -1;
            Stage.logEntries(answer).forEach((entry) => row({ kind: "event", text: entry.message }));
            logSince = Stage.nextSince(answer, logSince);
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
        at = at + 1;
        if (fastTo >= 0 && at >= fastTo)
            fastTo = -1;
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
            Observed.say(stage.key, "info", line);
        }
    }

    // The replay's beat: each step stands for as long as it was given,
    // and steps sent again to go back are sent at once.
    Timer {
        id: beat
        interval: stage.fastTo >= 0 ? 0 : stage.at > 0 ? AgentReplay.steps[stage.at - 1].wait : 700
        running: stage.active && !stage.busy && stage.at < stage.total && (stage.playing || stage.fastTo > stage.at) && stage.tokenFile !== ""
        onTriggered: stage.step()
    }

    Component.onDestruction: Observed.forget(key)
}
