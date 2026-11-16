import QtQuick
import QtQuick.Controls

// A note the visitor types. The text belongs to this block, not to
// any shell, so rewriting the shell around it never loses a word.
// A TextField, not a bare TextInput: the control labels its field
// for assistive technology as the same control does anywhere.
Rectangle {
    id: note
    width: 300
    height: 76
    radius: 8
    color: look.raised

    readonly property string text: field.text

    // The colours this app draws with, for the scheme the reader chose:
    // each the dark it was drawn in or a light that keeps the text on it
    // as readable.
    QtObject {
        id: look
        readonly property bool dark: Application.styleHints.colorScheme === Qt.ColorScheme.Dark
        readonly property color canvas: dark ? "#171b26" : "#f6f4ee"
        readonly property color ink: dark ? "#eef0f6" : "#1b1f2a"
        readonly property color muted1: dark ? "#93a0ba" : "#4d5566"
        readonly property color muted2: dark ? "#9aa7c2" : "#4d5566"
        readonly property color raised: dark ? "#202636" : "#ffffff"
    }

    Text {
        x: 12
        y: 8
        color: look.muted1
        font.pixelSize: 12
        text: qsTr("Note for the baker")
    }
    TextField {
        id: field
        objectName: "noteField"
        x: 12
        y: 26
        width: parent.width - 24
        height: 40
        palette.base: look.canvas
        palette.text: look.ink
        palette.placeholderText: look.muted2
        // No Accessible.name: the control says its placeholder,
        // as every TextField does; naming the wrapper here would
        // label the box around the field instead of the field.
        placeholderText: qsTr("Note for the baker…")
    }
}
