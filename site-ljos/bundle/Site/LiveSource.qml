import Ljos.Ui
import Site
import Ljos.Core
import Ljos.Layout
import Ljos.Controls as C
import "../shells.js" as Shells
import "logic/shells.ts" as Sources

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
    // Its source; `Sources.none` (no file) until it comes.
    property Sources.Source source: Sources.none
    readonly property bool has: source.file !== ""
    // The text as the site ships it, and as the reader has it now.
    readonly property string shipped: source.text
    // An edit of the reader's runs, or broke: what Reset puts back.
    property bool edited: false
    // What is wrong with the text as it stands, as the compiler says it.
    property list<Sources.Diagnostic> diagnostics
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
    signal ran(unknown shell)
    signal broke(list<Sources.Diagnostic> diagnostics)
    signal reset

    width: parent !== null ? parent.width : 0
    height: parent !== null ? parent.height : 0

    // Why the shell's QML did not come, until it does: said in place of
    // the editor, with a Retry.
    property string failed: ""

    Component.onCompleted: live.fetch()

    function fetch(): void {
        live.failed = "";
        Shells.sources(Built.base).then((all: unknown) => {
            live.source = Sources.sourceOf(all, live.name);
            if (live.has) {
                editor.text = live.source.text;
                Shells.editorHeld(live.name);
            } else
                live.failed = t`There is no ${live.name}.qml to edit.`;
        }, (why: unknown) => {
            console.warn(`LiveSource: ${Sources.whyOf(why)}`);
            live.failed = Sources.whyOf(why);
        });
    }

    // Moved into the next shell: the reader is still where they typed.
    // The last shell may go before the next has a place for it, and
    // waiting out of sight is not where they typed.
    onParentChanged: {
        if (live.refocus)
            later(() => {
                if (!live.refocus || !live.visible)
                    return;
                live.refocus = false;
                editor.refocus();
            });
    }

    function check(): void {
        if (!live.has)
            return;
        const mine = ++live.asked;
        const text = editor.text;
        Shells.checked(live.source.file, text).then((made: unknown) => {
            if (mine !== live.asked)
                return;
            live.edited = true;
            const diagnostics = Sources.diagnosticsOf(made);
            if (diagnostics !== undefined) {
                live.diagnostics = diagnostics;
                live.broke(diagnostics);
                return;
            }
            live.diagnostics = [];
            live.refocus = editor.activeFocus;
            live.ran(Sources.shellOf(made));
        });
    }

    function putBack(): void {
        if (!live.has)
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
        fill: "transparent"

        Text {
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (LayoutMirroring).
            readonly property real startX: 12
            x: LayoutMirroring.enabled ? parent.width - width - startX : startX
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width - startX - reset.width - 20
            text: live.source.file
            color: Theme.textMuted
            font.family: Theme.mono
            font.size: 12
            elide: Text.ElideMiddle
        }
        C.Button {
            id: reset
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (LayoutMirroring).
            readonly property real startX: parent.width - width - 8
            x: LayoutMirroring.enabled ? parent.width - width - startX : startX
            anchors.verticalCenter: parent.verticalCenter
            height: live.touch ? 44 : implicitHeight
            subtle: true
            iconName: "refresh-cw"
            text: t`Reset`
            enabled: live.has
            onClicked: live.putBack()
        }
    }

    // The shell's QML did not come: why, and another try.
    Column {
        visible: live.failed !== ""
        // Where it starts, read from the left; a right-to-left page
        // sets it as far from the right (LayoutMirroring).
        readonly property real startX: 12
        x: LayoutMirroring.enabled ? parent.width - width - startX : startX
        y: head.height + 12
        width: parent.width - 24
        spacing: 8

        Text {
            width: parent.width
            text: t`The shell's QML could not be loaded: ${live.failed}`
            color: Theme.text
            font.family: Theme.sans
            font.size: 13
            wrap: Text.Wrap
            Accessible.role: Accessible.AlertMessage
            Accessible.name: text
        }
        C.Button {
            height: live.touch ? 44 : implicitHeight
            iconName: "refresh-cw"
            text: t`Retry`
            onClicked: live.fetch()
        }
    }

    Rectangle {
        visible: live.failed === ""
        y: head.height
        width: parent.width
        height: parent.height - y
        fill: Theme.codeBg
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
                code: live.source.text
                rich: live.source.rich
                label: t`Edit the running shell's QML`
                color: Theme.codeFg
                diagnostics: live.diagnostics.filter((one: Sources.Diagnostic) => one.line > 0).map((one: Sources.Diagnostic) => ({ message: one.message, line: one.line, column: one.column !== 0 ? one.column : 1, endLine: one.endLine, endColumn: one.endColumn }))
                onTextChanged: {
                    if (!live.has)
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
                    // An answer to the text before this is not shown
                    // over it.
                    ++live.asked;
                    pause.restart();
                }
            }
        }
    }
}
