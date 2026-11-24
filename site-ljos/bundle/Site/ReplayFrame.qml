// Ljós's Core before QtQuick: only its t`` is wanted here, and a name
// both have (Timer) stays QtQuick's, the later import.
import Ljos.Core
import QtQuick
import Site
import "../nav.js" as Nav

// Where the front page's replay stands: DemoFrame's rules for a demo
// (README, "What runs, and when"), with what only this one does. Its
// poster is drawn by the page with its own parts, in both schemes at
// once, so no picture is fetched and its words stay text. It starts
// itself once on screen, unless the reader asked for less motion, and
// once only: what a reader pauses, or the budget stops, stays so. Its
// one quiet button, and a line of `note`, stand at the top, in the room
// the demo's own toolbar leaves at its end (AgentView): they are the
// first thing read, tabbed to and seen. It is as tall as demo and poster
// say. Only the front page has it, so no other page's first load
// carries what it adds (tests/payload.spec.js).
Item {
    id: frame

    // The demo, as a function that imports its module (Demos/later.js).
    property var source: undefined
    // Its poster, the page's own parts. It can be used before any Run,
    // so a press on it runs nothing.
    property Component poster: null
    // What the demo is, for its control's name: "Run the agent replay".
    property string what: "this demo"
    property string note: ""
    // The flickable the page scrolls in, so the frame knows when it is
    // on screen.
    property var scroller: null
    property real aspect: 420 / 720

    readonly property int actWidth: 104
    readonly property int pictureHeight: Math.round(width * aspect)
    readonly property int ownHeight: Math.max(pictured.item ? pictured.item.implicitHeight : 0, loader.item ? loader.item.implicitHeight : 0)
    readonly property int surfaceHeight: Math.max(pictureHeight, ownHeight)
    height: surfaceHeight

    // Set once the page this frame was written into is the reader's:
    // the demo is never part of the page the build writes.
    property bool awake: false
    readonly property bool runnable: awake && Nav.canRun("")
    readonly property bool drawn: loader.status === Loader.Ready && loader.item !== null && loader.item.ready !== false

    // Whether it has run: it starts itself only if nothing has started it,
    // the reader's Run included, so a pause of theirs stays one.
    property bool startedItself: false
    readonly property bool startable: runnable && !Theme.calm && runner.onScreen && Running.shown
    onStartableChanged: {
        if (!startable || startedItself)
            return;
        startedItself = true;
        runner.run();
    }

    // A demo that plays to an end and says it has stopped (`playing`)
    // offers to go on, or again where it has `ended`, never a Pause of what
    // stands still.
    readonly property bool replayable: loader.item !== null && loader.item.playing === false && (runner.phase === "live" || runner.phase === "paused")
    readonly property bool again: replayable && loader.item.ended === true

    Timer {
        interval: 0
        running: Nav.inBrowser()
        onTriggered: frame.awake = true
    }

    // Declared before the demo, so Tab and a screen reader come to it
    // first. No larger than it is: the demo's own buttons beside it take
    // their presses.
    Rectangle {
        z: 1
        x: frame.width - width - Theme.xxs
        y: Theme.xxs
        width: frame.actWidth
        height: 32
        color: "transparent"

        // One button through the run's phases, so the focus a keyboard
        // reader gave it stays as it changes.
        StageButton {
            width: frame.actWidth
            anchors.verticalCenter: parent.verticalCenter
            visible: runner.phase !== ""
            // A replay that did not load is tried again from here, not
            // left starting: nothing else on the frame would offer it.
            busy: runner.phase === "loading"
            text: {
                if (frame.replayable)
                    return frame.again ? t`Run again` : t`Resume`;
                switch (runner.phase) {
                case "loading":
                    return t`Starting…`;
                case "failed":
                    return t`Try again`;
                case "live":
                    return t`Pause`;
                case "paused":
                    return t`Resume`;
                default:
                    return t({ message: "Run", context: "stage" });
                }
            }
            label: {
                if (frame.replayable)
                    return frame.again ? t`Run again: ${frame.what}` : t`Resume ${frame.what}`;
                switch (runner.phase) {
                case "loading":
                    return t`Starting ${frame.what}…`;
                case "failed":
                    return t`Try ${frame.what} again`;
                case "live":
                    return t`Pause ${frame.what}`;
                case "paused":
                    return t`Resume ${frame.what}`;
                default:
                    return t`Run ${frame.what}`;
                }
            }
            onPressed: {
                // Back to its picture, which lets the failed module go,
                // and asked again once that is done.
                if (runner.phase === "failed") {
                    runner.evict();
                    Qt.callLater(() => runner.ask());
                    return;
                }
                if (!frame.replayable)
                    return runner.act();
                loader.item.play();
                runner.ask();
            }
        }
    }
    Text {
        z: 1
        visible: frame.note !== ""
        x: frame.width - width - Theme.xxs
        y: 56 - Math.round(height / 2)
        text: frame.note
        color: Theme.textMuted
        font.family: Theme.sans
        font.pixelSize: Theme.captionSize
    }

    Rectangle {
        anchors.fill: parent
        radius: Theme.radius
        color: "transparent"
        clip: true

        // The poster is hidden, not unmade, once the demo is drawn: the
        // page is still being taken over as written when the demo starts.
        Loader {
            id: pictured
            width: frame.width
            height: frame.surfaceHeight
            active: frame.poster !== null
            visible: !(frame.drawn && loader.opacity === 1)
            sourceComponent: frame.poster
        }
    }

    Loader {
        id: loader
        // Over a poster that takes presses, nothing lies until it runs.
        visible: active
        width: frame.width
        height: frame.surfaceHeight
        // Whatever the demo draws past its area is cut at the frame's
        // edge: it never draws over the page around it.
        clip: true
        // Made when it starts, by itself or by the reader's Run. It takes
        // no GPU device.
        active: frame.runnable && runner.started
        source: frame.source
        opacity: frame.drawn ? 1 : 0
        Behavior on opacity {
            NumberAnimation {
                duration: Theme.enterPanel
                easing.type: Easing.OutCubic
            }
        }
        onLoaded: {
            item.active = Qt.binding(() => runner.running);
            item.calm = Qt.binding(() => Theme.calm);
        }
    }

    Runner {
        id: runner
        spanWidth: frame.width
        spanHeight: frame.surfaceHeight
        pressRuns: false
        what: frame.what
        can: frame.runnable
        ready: frame.drawn
        failed: loader.status === Loader.Error
        onStartedChanged: {
            if (started)
                frame.startedItself = true;
        }
    }
}
