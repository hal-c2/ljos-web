// Ljos.Core before QtQuick so t`` is available while shared names stay QtQuick's.
import Ljos.Core
import QtQuick
import QtQuick.Controls

// A note block whose text belongs to the block itself, not the shell around it:
// rewriting Shell.qml keeps every word the reader typed. Try changing label or
// placeholder below, or binding to note.text from Shell.qml.
Rectangle {
    id: note
    width: 300
    height: 76
    radius: 8
    color: look.raised

    // Remix knobs: customise the field's heading and placeholder in one line.
    property string label: t`Note for the baker`
    property string placeholder: t`Note for the baker…`

    readonly property string text: field.text

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
        text: note.label
    }
    // TextField (rather than a bare TextInput) exposes its placeholder as the
    // field's accessible name, so we intentionally leave the outer box unnamed.
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
        placeholderText: note.placeholder
    }
}
