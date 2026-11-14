import QtQuick
import Site
import "code-editor.js" as Editor

// Code the reader edits. As first written, and for a reader with no
// script, it is the code highlighted by the build (`rich`, the
// `tok-*` spans of `lezer-ljos/html`) in a Text; the first focus, press
// or key brings CodeMirror in over it, in the Text's own font and line
// height, so nothing moves (ljos-web's `codeblock/attach`). The field
// is `text` whichever draws it: an edit is written to it, and writing
// it (a Reset) is shown. `diagnostics` (`{ message, line, column,
// endLine?, endColumn?, severity?, code? }`, 1-based, in this text)
// are squiggles in the editor, and `errors` is the item that says them
// in words, which a screen reader is pointed to.
Item {
    id: field

    property string text: code
    // What `rich` is the highlighting of.
    property string code: ""
    property string rich: ""
    property string lang: "qml"
    property string label: "Code"
    property var diagnostics: []
    property Item errors: null
    property color color: Theme.ink
    property int pixelSize: 12
    // A line height of the code's own, in pixels: the build and the
    // browser set lines that far apart whatever the font, so the page
    // the build wrote does not move when it hydrates, and the editor
    // that comes in takes it too.
    property int lineHeight: Math.round(pixelSize * 1.5)
    // CodeMirror draws the field now, and is the field a screen
    // reader is in.
    property bool editing: false

    // The reader reached for the code (a focus or a press): what an
    // edit needs may be fetched now.
    signal reached()

    implicitWidth: shown.implicitWidth
    implicitHeight: shown.implicitHeight
    clip: true
    activeFocusOnTab: true
    Accessible.role: editing ? Accessible.Grouping : Accessible.EditableText
    Accessible.name: label
    Accessible.description: "Tab indents. Press Escape, then Tab, to leave this editor."

    Component.onDestruction: Editor.dispose(field)
    onActiveFocusChanged: {
        if (!activeFocus)
            return Editor.left(field);
        field.reached();
        Editor.bringIn(field, shown, true);
    }
    onTextChanged: Editor.textChanged(field)
    onDiagnosticsChanged: Editor.diagnosticsChanged(field)

    Text {
        id: shown
        color: field.color
        font.family: Theme.mono
        font.pixelSize: field.pixelSize
        lineHeightMode: Text.FixedHeight
        lineHeight: field.lineHeight
        textFormat: Text.RichText
        wrapMode: Text.NoWrap
        text: Editor.shownAs(field.rich, field.text, field.code)
    }
    MouseArea {
        anchors.fill: parent
        enabled: !field.editing
        Accessible.ignored: true
        cursorShape: Qt.IBeamCursor
        // The press asks first, so the editor comes with its caret where
        // the press was; the field then has focus, and a reader who
        // moves on before the editor has come is not pulled back.
        onPressed: (mouse) => {
            field.reached();
            Editor.bringIn(field, shown, true, { "x": mouse.x, "y": mouse.y });
            field.forceActiveFocus();
        }
    }
}
