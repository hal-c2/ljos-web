// Ljós's Core before QtQuick: only its t`` is wanted here, and a name
// both have (Timer) stays QtQuick's, the later import.
import Ljos.Core
import QtQuick
import Ljos.Blocks
import Site
import Demos
import "pantry-live.js" as LivePantry
import "../observing.js" as Observing

// The flagship: a small app whose shell the visitor rewrites here.
// The app is its blocks (Pantry/Basket — what was bought; Pantry/Note
// — the words; a status line contributed into the `status` Slot its
// StatusSlot block names) and `PantryShell`, the shell it ships
// with. The editor starts from that shell's source; applying an
// edit compiles it in the page against the blocks' own files and
// reloads the stage's ShellLoader with the state carried across.
// A shell that does not compile is refused with what broke and
// where, beside the editor, and the last good shell stands. As
// first written — and with no script — the stage holds the app's
// own shell, which is also the loader's fallback: it runs as the
// build compiled it until the visitor's first edit, so the compiler
// is fetched only then.
Column {
    id: demo

    property string said: ""
    property bool started: false
    // The text last applied: a change to that text is not an
    // edit, whenever it is heard — a change handler may be
    // queued behind the assignment (the runtime's `after()`),
    // so a flag set after it would not guard it; the comparison
    // does, and it still lets a revert to an earlier text apply,
    // since that differs from what was last applied.
    property string applied: ""
    // False where the browser runs no WebAssembly: there is no
    // compiler, so the app's own shell (the fallback) stands and the
    // demo says why it cannot be rewritten here.
    property bool runs: true
    // Whether its Observer is fetched ahead, once the page is idle.
    property bool observerWhenIdle: true

    width: parent ? parent.width : 680
    spacing: 0

    function apply() {
        applied = editor.text;
        LivePantry.setShell(editor.text);
        if (!runs)
            return;
        if (!started) {
            started = true;
            // At once, as CodeBlock gives its stage's: what a visitor
            // does to the app's shell before a check answered is kept.
            stage.source = LivePantry.sourceFor();
            return;
        }
        stage.reload().then(function (why) {
            demo.said = why || "";
            editor.diagnostics = LivePantry.diagnostics();
        });
    }
    // The demo's own writing into the editor, in one place: say
    // first that this text is the applied one, then write it, so
    // whenever the change is heard — during the assignment (a
    // settle outside a flush) or after it (a handler queued
    // inside one) — it compares equal and restarts nothing; the
    // debounce a visitor's typing just armed is stopped as well.
    function writeOwn(text) {
        applied = text;
        editor.text = text;
        debounce.stop();
    }

    // Before the first edit the stage is the app's shell already.
    function resetToAppShell() {
        writeOwn(PantryProject.shellText);
        if (started)
            apply();
    }

    // The app's own shell stands as the stage's fallback, compiled
    // with the page, so nothing is applied until a reader edits: the
    // first apply fetches the compiler, megabytes of wasm.
    Component.onCompleted: {
        Observing.watch(demo.observerMoved);
        LivePantry.setProject(PantryProject.files, PantryProject.shellText);
        writeOwn(PantryProject.shellText);
        // As CodeBlock asks it: before any edit, so the demo says why
        // it cannot be rewritten here before it is tried.
        LivePantry.needsWasm().then(function (why) {
            if (why) {
                demo.runs = false;
                demo.said = why;
            }
        });
    }

    // The Observer on the app, under whichever shell stands: a shell
    // applied is the app made again, which the Observer follows as it
    // follows a reload.
    readonly property string observerKey: Observing.keyFor("pantry")
    property bool observing: false
    function observerMoved() {
        observing = Observing.isShown(observerKey);
    }
    Component.onDestruction: {
        Observing.unwatch(demo.observerMoved);
        Observing.close(observerKey);
    }

    Timer {
        id: debounce
        interval: 400
        onTriggered: demo.apply()
    }

    // A wide page puts the app and its shell's source side by side, as
    // a playground: the app at its own size on the left, the editor
    // filling the rest at the app's height. A narrow one stacks them.
    readonly property bool side: width >= 900
    readonly property int editorHeight: side ? 400 - head.height : 300

    // The playground: one panel, its corners the look's, the app and the
    // editor in it with a hairline between. Its own hairline is the frame
    // round it, a pixel wider: a line drawn over the panel would take the
    // visitor's clicks from the app.
    Rectangle {
        width: parent.width
        height: bench.height + 2
        radius: Theme.radiusLarge
        color: Theme.divider

        Rectangle {
            id: bench
            x: 1
            y: 1
            width: parent.width - 2
            height: demo.side ? 400 : stageBox.height + 1 + head.height + editorBox.height
            radius: Theme.radiusLarge - 1
            color: Theme.codeBg
            clip: true

            // The stage: the running app, under whichever shell stands. It
            // is a named group, so the app's controls are found as the app's,
            // apart from the editor's and the page's.
            Rectangle {
                id: stageBox
                // The app is a 480 × 400 window, as its shell is written; on a
                // screen narrower than that it is shown whole, smaller, never
                // cut off at the page's edge.
                readonly property real fit: Math.min(1, width / 480)
                width: demo.side ? 480 : parent.width
                height: Math.round(400 * fit)
                color: Theme.stage
                Accessible.role: Accessible.Grouping
                Accessible.name: "The Pantry, running"

                ShellLoader {
                    id: stage
                    onItemChanged: Observing.retarget(demo.observerKey, item)
                    width: 480
                    height: 400
                    scale: stageBox.fit
                    transformOrigin: Item.TopLeft
                    x: Math.max(0, (parent.width - width * stageBox.fit) / 2)
                    fallback: appShell
                }
                Component {
                    id: appShell
                    PantryShell {}
                }
            }
            // The hairline between the app and its source.
            Rectangle {
                x: demo.side ? stageBox.width : 0
                y: demo.side ? 0 : stageBox.height
                width: demo.side ? 1 : parent.width
                height: demo.side ? parent.height : 1
                color: Theme.divider
            }

            Column {
                x: demo.side ? stageBox.width + 1 : 0
                y: demo.side ? 0 : stageBox.height + 1
                width: parent.width - x

                Rectangle {
                    id: head
                    width: parent.width
                    height: Math.max(headRow.implicitHeight, observerButton.implicitHeight) + 2 * Theme.xs
                    color: Theme.surface

                    Row {
                        id: headRow
                        anchors.left: parent.left
                        anchors.leftMargin: Theme.m
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: Theme.s
                        // Up to the Observer button, when it shows: on a phone the
                        // caption gives up its room, elided, before Reset gives any.
                        readonly property real room: parent.width - anchors.leftMargin
                            - (observerButton.visible ? observerButton.width + observerButton.anchors.rightMargin + spacing : anchors.leftMargin)

                        Text {
                            anchors.verticalCenter: parent.verticalCenter
                            width: Math.max(0, Math.min(implicitWidth, headRow.room - resetButton.width - headRow.spacing))
                            elide: Text.ElideRight
                            color: Theme.textMuted
                            font.family: Theme.mono
                            font.pixelSize: Theme.captionSize - 1
                            text: "Shell.qml: edit it live"
                        }
                        StageButton {
                            id: resetButton
                            anchors.verticalCenter: parent.verticalCenter
                            text: "Reset"
                            label: "Reset to the app's shell"
                            onPressed: demo.resetToAppShell()
                        }
                    }

                    // Ljós's Observer on the app while it runs: its objects,
                    // properties, frames and log, under whichever shell stands.
                    ObserverButton {
                        id: observerButton
                        prefetchesWhenIdle: demo.observerWhenIdle
                        anchors.right: parent.right
                        anchors.rightMargin: Theme.xs
                        anchors.verticalCenter: parent.verticalCenter
                        visible: stage.item !== null
                        checked: demo.observing
                        label: t`Observer for the Pantry`
                        onPressed: Observing.toggle(demo.observerKey, stage.item, null, t`the Pantry`)
                    }
                    Rectangle {
                        y: parent.height - 1
                        width: parent.width
                        height: 1
                        color: Theme.divider
                    }
                }

                Rectangle {
                    id: editorBox
                    width: parent.width
                    height: demo.editorHeight
                    color: Theme.codeBg
                    // The ring of the editor in it, which scrolls (Site/CodeEditor).
                    border.color: editor.activeFocus ? Theme.focusRing : "transparent"
                    border.width: 2

                    Flickable {
                        anchors.fill: parent
                        anchors.margins: Theme.s
                        contentWidth: editor.width
                        contentHeight: editor.height
                        clip: true

                        // Highlighted by the build; CodeMirror once the reader is
                        // in it (Site/CodeEditor).
                        CodeEditor {
                            id: editor
                            width: Math.max(parent.width, implicitWidth)
                            code: PantryProject.shellText
                            rich: PantryProject.shellRich
                            label: "Edit the Pantry's Shell.qml"
                            errors: told
                            onTextChanged: {
                                if (text !== demo.applied)
                                    debounce.restart();
                            }
                        }
                    }
                }
            }
        }
    }

    Text {
        id: told
        visible: (demo.said || stage.error) !== ""
        width: parent.width
        topPadding: Theme.s
        text: demo.said || stage.error
        color: Theme.danger
        font.family: Theme.mono
        font.pixelSize: Theme.captionSize
        lineHeightMode: Text.FixedHeight
        lineHeight: Theme.captionLine
        wrapMode: Text.Wrap
    }
    Text {
        width: parent.width
        topPadding: Theme.m
        text: "Try moving StatusSlot below Basket, setting color: \"#241a10\", or renaming the shop. Your basket and note stay as they are."
        color: Theme.textMuted
        font.family: Theme.sans
        font.pixelSize: Theme.uiSize
        lineHeightMode: Text.FixedHeight
        lineHeight: Theme.uiLine
        wrapMode: Text.Wrap
    }
}
