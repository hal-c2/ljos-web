import QtQuick
import Site

// Whether what it lies over runs: an example's stage or a demo. It
// fills that place and, while the thing is not running, a press
// anywhere on it runs it. What runs is told by `running`; the reader,
// the page's budget and its view (Running) decide it:
//
// - nothing runs until the reader asks: a press on it, an edit of its
//   code (CodeBlock), or, where it is `gated` (a window, 3D, what moves
//   on its own, a demo), its Run button, which Tab reaches, Return or
//   Space presses and a screen reader names and presses;
// - a started one runs only while it is on screen and the tab is
//   shown: away, it pauses, and back it resumes;
// - at most Running.most are started at once: one more stops another
//   (Running.claim), which shows its Run button and waits for it.
Item {
    id: runner

    property bool gated: true
    // False where it cannot run at all (no WebAssembly): no button.
    property bool can: true
    property string label: "Run this example"
    property bool asked: false
    // Stopped for the budget: its Run button says it can run again,
    // gated or not.
    property bool evicted: false
    property bool onScreen: false

    readonly property bool started: can && asked
    readonly property bool running: started && onScreen && Running.shown
    // What shows its Run button: one that is gated, and one the budget
    // stopped. A plain example that has not run is its picture, which a
    // press runs, with no button over what it draws.
    readonly property bool waiting: can && !started && (gated || evicted)

    function run() {
        asked = true;
        evicted = false;
    }
    function evict() {
        asked = false;
        evicted = true;
    }
    // Whether any of it is in the band of the page the reader sees.
    function look() {
        if (width <= 0 || height <= 0 || !visible) {
            onScreen = false;
            return;
        }
        var at = runner.mapToItem(null, 0, 0);
        onScreen = at.y + height > Running.viewTop && at.y < Running.viewBottom;
    }

    onStartedChanged: started ? Running.claim(runner) : Running.release(runner)
    onHeightChanged: look()
    onVisibleChanged: look()
    Component.onCompleted: Qt.callLater(look)
    Component.onDestruction: Running.release(runner)

    Connections {
        target: Running
        function onMoved() {
            runner.look();
        }
    }

    // Not running: a press on it runs it, as the button does, and still
    // lands on what is under it; a picture takes no press. It stands
    // where it cannot run too, only taking nothing, so a page without
    // WebAssembly is built of the same parts.
    MouseArea {
        id: hover
        anchors.fill: parent
        visible: !runner.started
        enabled: runner.can
        hoverEnabled: runner.can
        Accessible.ignored: true
        cursorShape: runner.can ? Qt.PointingHandCursor : Qt.ArrowCursor
        onPressed: (mouse) => {
            runner.run();
            mouse.accepted = false;
        }
    }

    Rectangle {
        id: button
        visible: runner.waiting
        anchors.centerIn: parent
        width: words.implicitWidth + 2 * Theme.l
        height: 44
        radius: height / 2
        color: hover.containsMouse ? Theme.accentHover : Theme.accent
        // The focus ring stands clear of the button, so it reads on the
        // accent and on any poster under it.
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
        Accessible.name: runner.label
        Accessible.onPressAction: () => runner.run()
        Keys.onPressed: (event) => {
            if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                runner.run();
                event.accepted = true;
            }
        }

        Text {
            id: words
            anchors.centerIn: parent
            text: "▶ Run"
            color: Theme.textOnAccent
            font.family: Theme.sans
            font.pixelSize: Theme.bodySize
            font.weight: Font.Bold
        }
    }
}
