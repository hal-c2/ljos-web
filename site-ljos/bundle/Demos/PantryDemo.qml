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
// own shell, which is also the loader's fallback.
Column {
    id: demo

    property string said: ""
    property bool started: false

    width: parent ? parent.width : 680
    spacing: 0

    function apply() {
        LivePantry.setShell(editor.text);
        if (!started) {
            started = true;
            stage.source = LivePantry.sourceFor();
            return;
        }
        stage.reload().then(function (why) {
            demo.said = why || "";
        });
    }
    function resetToAppShell() {
        editor.text = PantryProject.shellText;
        apply();
    }

    Component.onCompleted: {
        LivePantry.setProject(PantryProject.files, PantryProject.shellText);
        editor.text = PantryProject.shellText;
        apply();
    }

    Timer {
        id: debounce
        interval: 400
        onTriggered: demo.apply()
    }

    // The stage: the running app, under whichever shell stands.
    Item {
        width: parent.width
        height: 400

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
            contentWidth: editor.contentWidth
            contentHeight: editor.contentHeight
            clip: true

            TextEdit {
                id: editor
                width: Math.max(parent.width, contentWidth)
                color: Theme.ink
                font.family: Theme.mono
                font.pixelSize: 12
                wrapMode: TextEdit.NoWrap
                selectByMouse: true
                onTextChanged: debounce.restart()
            }
        }
    }

    Text {
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
