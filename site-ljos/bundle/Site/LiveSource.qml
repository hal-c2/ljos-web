import QtQuick
import Site
import Ljos.Core
import Ljos.Controls as C
import "../shells.js" as Shells

// The running shell's own QML, edited in place: each edit is compiled
// as the reader pauses, and one that compiles is the shell from then on,
// with no press, the page and what runs on it kept. One that does not
// says what broke (`broke`), and the shell stays the last that compiled.
// Made once (Main.qml) and moved into each shell that has a place for it
// (`site.source.live`), so the editor, its text and the reader's cursor
// stay as the shell it edits is swapped for the edit.
Item {
    id: live

    // The shell whose QML this is, by its file under Shells/.
    property string name: "workbench"
    property var source: null
    // The text as the site ships it, and as the reader has it now.
    readonly property string shipped: source ? source.text : ""
    // An edit of the reader's runs, or broke: what Reset puts back.
    property bool edited: false
    // What is wrong with the text as it stands, as the compiler says it.
    property var diagnostics: []
    // The edit asked of the compiler last: an answer to an earlier one
    // is not shown over it.
    property int asked: 0
    // The editor had the reader's focus as its shell was swapped: it is
    // given it back in the next one.
    property bool refocus: false
    // On a phone, where what is pressed is a finger's size.
    property bool touch: false

    // A shell the edit made, to be shown; what broke in one that did
    // not; the text back as shipped.
    signal ran(var shell)
    signal broke(var diagnostics)
    signal reset

    width: parent ? parent.width : 0
    height: parent ? parent.height : 0

    Component.onCompleted: {
        Shells.sources().then((all) => {
            live.source = all.shells[live.name] ?? null;
            if (live.source)
                editor.text = live.source.text;
        }, (why) => console.warn(`LiveSource: ${why}`));
    }

    // Moved into the next shell: the reader is still where they typed.
    // The last shell may go before the next has a place for it, and
    // waiting out of sight is not where they typed.
    onParentChanged: {
        if (live.refocus)
            Qt.callLater(() => {
                if (!live.refocus || !live.visible)
                    return;
                live.refocus = false;
                editor.refocus();
            });
    }

    function check() {
        if (!live.source)
            return;
        var mine = ++live.asked;
        var text = editor.text;
        Shells.checked(live.source.file, text).then((made) => {
            if (mine !== live.asked)
                return;
            live.edited = true;
            if (made.diagnostics) {
                live.diagnostics = made.diagnostics;
                live.broke(made.diagnostics);
                return;
            }
            live.diagnostics = [];
            live.refocus = editor.activeFocus;
            live.ran(made.shell);
        });
    }

    function putBack() {
        if (!live.source)
            return;
        ++live.asked;
        pause.stop();
        live.refocus = editor.activeFocus;
        editor.text = live.source.text;
        live.diagnostics = [];
        live.edited = false;
        live.reset();
    }

    Timer {
        id: pause
        interval: 450
        onTriggered: live.check()
    }

    Rectangle {
        id: head
        width: parent.width
        height: live.touch ? 52 : 36
        color: "transparent"

        Text {
            x: 12
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width - x - reset.width - 20
            text: live.source ? live.source.file : ""
            color: Theme.textMuted
            font.family: Theme.mono
            font.pixelSize: 12
            elide: Text.ElideMiddle
        }
        C.Button {
            id: reset
            x: parent.width - width - 8
            anchors.verticalCenter: parent.verticalCenter
            height: live.touch ? 44 : implicitHeight
            subtle: true
            iconName: "refresh-cw"
            text: t`Reset`
            enabled: live.source !== null
            onClicked: live.putBack()
        }
    }

    Rectangle {
        y: head.height
        width: parent.width
        height: parent.height - y
        color: Theme.codeBg
        border.color: editor.activeFocus ? Theme.focusRing : "transparent"
        border.width: editor.activeFocus ? 2 : 0

        Flickable {
            anchors.fill: parent
            anchors.margins: 10
            contentWidth: editor.width
            contentHeight: editor.height
            clip: true

            CodeEditor {
                id: editor
                width: Math.max(parent.width, implicitWidth)
                code: live.source ? live.source.text : ""
                rich: live.source ? live.source.rich : ""
                label: t`Edit the running shell's QML`
                color: Theme.codeFg
                diagnostics: live.diagnostics.filter((one) => one.line > 0).map((one) => ({ message: one.message, line: one.line, column: one.column || 1, endLine: one.endLine, endColumn: one.endColumn }))
                onTextChanged: {
                    if (!live.source)
                        return;
                    if (editor.text === live.source.text) {
                        // Typed back to the file as shipped (or given
                        // it first): that one runs.
                        pause.stop();
                        ++live.asked;
                        if (live.edited) {
                            live.diagnostics = [];
                            live.edited = false;
                            live.refocus = editor.activeFocus;
                            live.reset();
                        }
                        return;
                    }
                    pause.restart();
                }
            }
        }
    }
}
