import QtQuick
import Site

// Whether what it lies over runs, an example's stage or a demo, and the
// control that says so. Nothing runs until the reader asks: the control
// is a Run button on the picture, which Tab reaches, Return or Space
// presses, a screen reader names and presses, and a press anywhere on
// the picture presses too. One control, in five phases, so the focus a
// keyboard reader gave it stays where it is as it changes:
//
// - `picture`: what the build drew stands; "▶ Run" on it;
// - `loading`: asked for, not drawn yet; "Loading…" where Run was;
// - `live`: drawn and running; the control steps to the corner, out of
//   the way, and says what the reader can do next: "✎ Edit" for an
//   example (its code takes the focus), "❚❚ Pause" for a demo;
// - `paused`: a demo the reader paused holds still where it was;
//   "▶ Run" in the corner goes on from there;
// - `failed`: what was asked for did not compile (the error is said
//   under it); "✎ Edit" in the corner takes the reader to its code,
//   since no Loading would ever end.
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

    // False where it cannot run at all (no WebAssembly): no control.
    property bool can: true
    // What runs, for the control's name: "Run the 3D demo".
    property string what: "this example"
    // Whether what runs is drawn: until it is, it is loading.
    property bool ready: false
    // Whether it never will be: it did not compile.
    property bool failed: false
    // Live, an example offers its code to edit; a demo, to pause.
    property bool editable: false
    signal edit()
    // The area it lies over. The runner itself takes none: an item over
    // what runs would be what the page's pointer lands on, and a native
    // field under it (an example's text input) would never be pressed.
    // Only its parts, the button and the press on the picture, take any.
    property real spanWidth: 0
    property real spanHeight: 0
    // The width the call to run is centred in: the picture's, where the
    // runner spans more (a stage wider than its example, whose corner
    // keeps the live control off what the example draws).
    property real callWidth: spanWidth

    property bool asked: false
    property bool paused: false
    property bool onScreen: false
    // The reader asked for this run: its phases are said aloud.
    property bool told: false

    readonly property bool started: can && asked
    readonly property bool running: started && !paused && onScreen && Running.shown
    readonly property string phase: !can ? "" : !started ? "picture" : !ready ? (failed ? "failed" : "loading") : paused ? "paused" : "live"
    // In the corner once there is something to see under it.
    readonly property bool aside: phase === "live" || phase === "paused" || phase === "failed"

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
    // What the control does in each phase.
    function act() {
        if (phase === "picture" || phase === "paused") {
            ask();
        } else if (phase === "failed") {
            edit();
        } else if (phase === "live") {
            if (editable)
                edit();
            else
                paused = true;
        }
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
        if (phase === "loading")
            Accessible.announce("Loading " + what);
        else if (phase === "live")
            Accessible.announce(what.charAt(0).toUpperCase() + what.slice(1) + " runs");
        else if (phase === "paused")
            Accessible.announce(what.charAt(0).toUpperCase() + what.slice(1) + " is paused");
        else if (phase === "failed")
            Accessible.announce(what.charAt(0).toUpperCase() + what.slice(1) + " did not compile");
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
    // button does. Only a completed one that the page did not scroll
    // under: a finger that sets out to scroll the page over a picture
    // runs nothing. It stands where it cannot run too, only taking
    // nothing, so a page without WebAssembly is built of the same parts.
    MouseArea {
        id: hover
        width: runner.spanWidth
        height: runner.spanHeight
        visible: !runner.started
        enabled: runner.can
        hoverEnabled: runner.can
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

    Rectangle {
        id: button
        visible: runner.phase !== ""
        // The call to run is the accent, in the middle of the picture;
        // once something runs the control is a quiet one in the corner.
        readonly property bool call: runner.phase === "picture"
        width: words.implicitWidth + 2 * (runner.aside ? Theme.s : Theme.l)
        height: runner.aside ? 36 : 44
        x: runner.aside ? runner.spanWidth - width - Theme.s : Math.round((runner.callWidth - width) / 2)
        y: runner.aside ? Theme.s : Math.round((runner.spanHeight - height) / 2)
        radius: height / 2
        color: call ? (hit.pressed ? Theme.accentPressed : hit.containsMouse || hover.containsMouse ? Theme.accentHover : Theme.accent) : (hit.pressed ? Theme.surfacePressed : hit.containsMouse ? Theme.surfaceHover : Theme.surfaceRaised)
        border.color: call ? "transparent" : Theme.border
        border.width: call ? 0 : 1
        // The focus ring stands clear of the button, so it reads on the
        // accent and on any picture under it.
        Rectangle {
            visible: button.activeFocus
            anchors.fill: parent
            anchors.margins: -4
            radius: height / 2
            color: "transparent"
            border.color: Theme.focusRing
            border.width: 2
        }
        activeFocusOnTab: true
        Accessible.role: Accessible.Button
        Accessible.name: {
            switch (runner.phase) {
            case "loading":
                return "Loading " + runner.what;
            case "live":
                return (runner.editable ? "Edit " : "Pause ") + runner.what;
            case "failed":
                return "Edit " + runner.what;
            default:
                return "Run " + runner.what;
            }
        }
        Accessible.onPressAction: () => runner.act()
        Keys.onPressed: (event) => {
            if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                runner.act();
                event.accepted = true;
            }
        }

        Text {
            id: words
            anchors.centerIn: parent
            text: {
                switch (runner.phase) {
                case "loading":
                    return "◌ Loading…";
                case "live":
                    return runner.editable ? "✎ Edit" : "❚❚ Pause";
                case "failed":
                    return "✎ Edit";
                default:
                    return "▶ Run";
                }
            }
            color: button.call ? Theme.textOnAccent : Theme.text
            font.family: Theme.sans
            font.pixelSize: runner.aside ? Theme.captionSize : Theme.bodySize
            font.weight: Font.Bold
        }

        MouseArea {
            id: hit
            anchors.fill: parent
            hoverEnabled: true
            Accessible.ignored: true
            cursorShape: runner.phase === "loading" ? Qt.BusyCursor : Qt.PointingHandCursor
            // A press leaves the keyboard where it was: once live, what
            // runs under the control has its own fields to type in.
            onClicked: runner.act()
        }
    }
}
