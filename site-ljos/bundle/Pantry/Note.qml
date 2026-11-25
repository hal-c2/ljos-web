import Ljos.Ui
import Ljos.Core

// A note block whose text belongs to the block itself, not the shell around it:
// rewriting Shell.qml keeps every word the reader typed. Try changing label or
// placeholder below, or binding to note.text from Shell.qml.
Rectangle {
    id: note
    width: 300
    height: 76
    radius: 8
    fill: look.raised

    // Remix knobs: customise the field's heading and placeholder in one line.
    property string label: t`Note for the baker`
    property string placeholder: t`Note for the baker…`

    readonly property string text: field.text

    Object {
        id: look
        readonly property bool dark: App.hints.colorScheme === ColorScheme.Dark
        readonly property color canvas: dark ? "#171b26" : "#f6f4ee"
        readonly property color ink: dark ? "#eef0f6" : "#1b1f2a"
        readonly property color muted1: dark ? "#93a0ba" : "#4d5566"
        readonly property color muted2: dark ? "#9aa7c2" : "#4d5566"
        readonly property color raised: dark ? "#202636" : "#ffffff"
    }

    Text {
        anchors.left: parent.left
        anchors.leftMargin: 12
        y: 8
        color: look.muted1
        font.size: 14
        text: note.label
    }
    // The field, in a box of its own; the placeholder shows until a word
    // is typed, and the label above is the field's name for a reader.
    Rectangle {
        anchors.left: parent.left
        anchors.leftMargin: 12
        y: 26
        width: parent.width - 24
        height: 40
        radius: 6
        fill: look.canvas
        border.width: field.activeFocus ? 2 : 1
        border.color: field.activeFocus ? look.ink : look.muted1

        Text {
            anchors.left: parent.left
            anchors.leftMargin: 10
            anchors.verticalCenter: parent.verticalCenter
            visible: field.text.length === 0
            color: look.muted2
            font.size: 14
            text: note.placeholder
        }
        TextInput {
            id: field
            objectName: "noteField"
            anchors.fill: parent
            anchors.leftMargin: 10
            anchors.rightMargin: 10
            verticalAlignment: TextInput.AlignVCenter
            color: look.ink
            font.size: 14
            Accessible.name: note.label
        }
    }
}
