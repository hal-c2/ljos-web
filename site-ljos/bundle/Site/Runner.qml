// Ljós's Core before QtQuick: only its t`` is wanted here, and a name
// both have (Timer) stays QtQuick's, the later import.
import Ljos.Core
import QtQuick
import Site

// Whether what it lies over runs, an example's stage or a demo. Nothing
// runs until the reader asks, but the front page's replay, which starts
// itself (ReplayFrame, never said aloud): the stage's toolbar (StageButton) asks
// with its Run, and a press anywhere on the picture asks too, unless
// that picture takes presses of its own (`pressRuns`). It draws
// nothing over what runs: a control over an app would hide what the app
// draws (a demo's caption, a field) and take the presses meant for it.
// Its phases are what the toolbar says:
//
// - `picture`: what the build drew stands; Run;
// - `loading`: asked for, not drawn yet; Starting…;
// - `live`: drawn and running; an example offers Stop, a demo Pause;
// - `paused`: a demo the reader paused holds still where it was;
//   Resume goes on from there;
// - `failed`: what was asked for did not compile (the error is said
//   under it); Stop takes the picture back.
//
// What is said aloud as it changes is said only for a run the reader
// asked for, in the page's one polite live region (Accessible.announce):
// a page scrolled past never talks.
//
// `running` is whether a started one is on screen and its tab shown:
// a demo pauses away and resumes back; an example stays as the reader
// left it. At most Running.most are started at once: one more stops
// another (Running.claim), which goes back to its picture and its Run.
Item {
    id: runner

    // False where it cannot run at all (no WebAssembly): nothing asks.
    property bool can: true
    // What runs, for what is said of it: "Run the 3D demo".
    property string what: "this example"
    // Whether what runs is drawn: until it is, it is loading.
    property bool ready: false
    // Whether it never will be: it did not compile.
    property bool failed: false
    // Live, an example offers to stop; a demo, to pause.
    property bool stops: false
    // The area it lies over. The runner itself takes none: an item over
    // what runs would be what the page's pointer lands on, and a native
    // field under it (an example's text input) would never be pressed.
    // Only the press on the picture takes any, and only before it runs.
    property real spanWidth: 0
    // Whether a press on the picture runs it.
    property bool pressRuns: true
    property real spanHeight: 0

    property bool asked: false
    property bool paused: false
    property bool onScreen: false
    // The reader asked for this run: its phases are said aloud.
    property bool told: false

    readonly property bool started: can && asked
    readonly property bool running: started && !paused && onScreen && Running.shown
    readonly property string phase: !can ? "" : !started ? "picture" : !ready ? (failed ? "failed" : "loading") : paused ? "paused" : "live"
    // A pointer over the picture: the stage shows it can be run.
    readonly property bool hovered: hover.containsMouse

    function run() {
        asked = true;
        paused = false;
    }
    // The reader asked (its Run, a press on its picture, an edit of its
    // code): its phases are said aloud.
    function ask() {
        told = true;
        run();
    }
    function evict() {
        asked = false;
        paused = false;
        told = false;
    }
    // What the toolbar's first button does in each phase.
    function act() {
        if (phase === "picture" || phase === "paused")
            ask();
        else if (phase === "failed" || (phase === "live" && stops))
            evict();
        else if (phase === "live")
            paused = true;
    }
    // Whether any of it is in the band of the page the reader sees.
    function look() {
        if (spanWidth <= 0 || spanHeight <= 0 || !visible) {
            onScreen = false;
            return;
        }
        var at = runner.mapToItem(null, 0, 0);
        onScreen = at.y + spanHeight > Running.viewTop && at.y < Running.viewBottom;
    }

    onStartedChanged: started ? Running.claim(runner) : Running.release(runner)
    onPhaseChanged: {
        if (!told)
            return;
        var name = what.charAt(0).toUpperCase() + what.slice(1);
        if (phase === "loading")
            Accessible.announce(t`Starting ${what}…`);
        else if (phase === "live")
            Accessible.announce(t`${name} runs`);
        else if (phase === "paused")
            Accessible.announce(t`${name} is paused`);
        else if (phase === "failed")
            Accessible.announce(t`${name} did not compile`);
    }
    onSpanHeightChanged: look()
    onVisibleChanged: look()
    Component.onCompleted: Qt.callLater(look)
    Component.onDestruction: Running.release(runner)

    Connections {
        target: Running
        function onMoved() {
            runner.look();
        }
    }

    // On the picture: a click or tap anywhere on it runs it, as the
    // toolbar's Run does. Only a completed one that the page did not
    // scroll under: a finger that sets out to scroll the page over a
    // picture runs nothing. It stands where it cannot run too, only
    // taking nothing, so a page without WebAssembly is built of the same
    // parts.
    MouseArea {
        id: hover
        width: runner.spanWidth
        height: runner.spanHeight
        visible: runner.pressRuns && !runner.started
        enabled: runner.can && runner.pressRuns
        hoverEnabled: runner.can && runner.pressRuns
        Accessible.ignored: true
        cursorShape: runner.can ? Qt.PointingHandCursor : Qt.ArrowCursor
        // Where the picture stood on the page at the press. A finger
        // the page scrolls with keeps its place on the picture, so a
        // swipe ends as a click on it; the picture having moved under
        // the window is what tells it from a tap.
        property real pressedAt: 0
        onPressed: pressedAt = runner.mapToItem(null, 0, 0).y
        onClicked: {
            if (Math.abs(runner.mapToItem(null, 0, 0).y - pressedAt) < 1)
                runner.ask();
        }
    }
}
