// Ljós's Core before QtQuick: only its t`` is wanted here, and a name
// both have (Timer) stays QtQuick's, the later import.
import Ljos.Core
import QtQuick
import Ljos.Observer
import Site
import "logic/stage.ts" as Stage
import "../observed.js" as Observed

// The agent replay, live: each recorded step is sent as the MCP tool call
// it was, through an InspectorClient, to an Inspector serving the dispatch
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

    function row(fields) {
        log.append(Object.assign({ kind: "say", text: "", tool: "", args: "", summary: "", answer: "", image: "" }, fields));
        return log.count - 1;
    }

    function step() {
        if (busy || at >= total || client.tokenFile === "")
            return;
        const next = AgentReplay.steps[at];
        if (next.say !== "")
            row({ kind: "say", text: next.say });
        const args = Stage.withFound(next.args, found);
        stepRow = row({ kind: "call", tool: next.tool, args: Stage.argsText(args), answer: "pending" });
        stepSerial = client.call(next.tool, JSON.stringify(args));
    }

    // Back to the empty window the replay starts from.
    function reset() {
        stepSerial = -1;
        stepRow = -1;
        found = "";
        at = 0;
        card.heading = "";
        card.tickets = [];
        card.filters = [];
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
        // empty and the steps before are sent again, at once.
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
    onTabPicked: (picked) => {
        tab = picked;
        if (picked === "observer")
            readTree();
    }
    onTreePicked: (ref) => {
        pickedRef = ref;
        inspectSerial = client.call("app_inspect", JSON.stringify({ target: ref }));
    }

    function readTree() {
        if (client.tokenFile !== "" && treeSerial < 0)
            treeSerial = client.call("app_objects", JSON.stringify({ depth: 6 }));
    }

    // The app's log, as an agent follows it: one watch out at a time,
    // which answers once the app has said more.
    function listen() {
        if (!active || watchSerial >= 0 || logsSerial >= 0 || client.tokenFile === "")
            return;
        const args = logsSeen < 0 ? {} : { since: { logs: logsSeen }, wait_ms: 30000, holder: key };
        watchSerial = client.call("app_watch", JSON.stringify(args));
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
                logsSerial = client.call("app_logs", JSON.stringify({ since: logSince, limit: 20 }));
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
            row({ kind: "end", text: t`Your turn: press any button in the app and watch this log.` });
        }
        if (tab === "observer") {
            readTree();
            if (pickedRef !== "")
                inspectSerial = client.call("app_inspect", JSON.stringify({ target: pickedRef }));
        }
    }

    Inspector {
        id: inspector
        target: stage.card
        logs: stage.logs
        title: t`Dispatch`
    }
    InspectorClient {
        id: client
        tokenFile: inspector.tokenFile
        clientName: "replay"
        onAnswered: (serial, tool, ok, result) => stage.answered(serial, tool, ok, result)
        onTokenFileChanged: stage.listen()
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
        running: stage.active && !stage.busy && stage.at < stage.total && (stage.playing || stage.fastTo > stage.at) && inspector.tokenFile !== ""
        onTriggered: stage.step()
    }

    Component.onDestruction: Observed.forget(key)
}
