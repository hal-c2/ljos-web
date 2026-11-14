import QtQuick
import Ljos.Blocks
import Site
import Demos
import "pantry-live.js" as LivePantry

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
            LivePantry.needsWasm().then(function (why) {
                if (why) {
                    demo.runs = false;
                    demo.said = why;
                }
            });
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

    Component.onCompleted: {
        LivePantry.setProject(PantryProject.files, PantryProject.shellText);
        writeOwn(PantryProject.shellText);
    }

    Timer {
        id: debounce
        interval: 400
        onTriggered: demo.apply()
    }

    // The stage: the running app, under whichever shell stands. It
    // is a named group, so the app's controls are found as the app's,
    // apart from the editor's and the page's.
    Item {
        width: parent.width
        height: 400
        Accessible.role: Accessible.Grouping
        Accessible.name: "The Pantry, running"

        ShellLoader {
            id: stage
            width: 480
            height: 400
            x: Math.max(0, (parent.width - width) / 2)
            fallback: appShell
        }
        Component {
            id: appShell
            PantryShell {}
        }
    }

    Rectangle {
        width: parent.width
        height: headRow.implicitHeight + 10
        color: Theme.panel
        border.color: Theme.border
        border.width: 1

        Row {
            id: headRow
            anchors.left: parent.left
            anchors.leftMargin: 10
            anchors.verticalCenter: parent.verticalCenter
            spacing: 14

            Text {
                anchors.verticalCenter: parent.verticalCenter
                color: Theme.muted
                font.family: Theme.mono
                font.pixelSize: 11
                text: "Shell.qml — the app's shell, yours to rewrite"
            }
            Item {
                width: resetWords.implicitWidth
                height: resetWords.implicitHeight + 4
                anchors.verticalCenter: parent.verticalCenter
                activeFocusOnTab: true
                Accessible.role: Accessible.Button
                Accessible.name: "Reset to the app's shell"
                Accessible.onPressAction: () => demo.resetToAppShell()
                Keys.onPressed: (event) => {
                    if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                        demo.resetToAppShell();
                        event.accepted = true;
                    }
                }

                Text {
                    id: resetWords
                    anchors.verticalCenter: parent.verticalCenter
                    text: "Reset"
                    color: Theme.accent
                    font.family: Theme.sans
                    font.pixelSize: 12
                }
                MouseArea {
                    anchors.fill: parent
                    Accessible.ignored: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: demo.resetToAppShell()
                }
            }
        }
    }

    Rectangle {
        width: parent.width
        height: 300
        color: Theme.codeBg
        border.color: Theme.border
        border.width: 1

        Flickable {
            anchors.fill: parent
            anchors.margins: 10
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

    Text {
        id: told
        visible: (demo.said || stage.error) !== ""
        width: parent.width
        text: demo.said || stage.error
        color: Theme.accent
        font.family: Theme.mono
        font.pixelSize: 12
        wrapMode: Text.Wrap
    }
    Text {
        width: parent.width
        text: "Try: move the StatusSlot under the Basket, turn the background #241a10, or rename the shop. The basket and your note keep what they hold."
        color: Theme.muted
        font.family: Theme.sans
        font.pixelSize: 12
        wrapMode: Text.Wrap
    }
}
