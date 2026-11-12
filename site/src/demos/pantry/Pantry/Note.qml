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
    color: "#202636"

    readonly property string text: field.text

    Text {
        x: 12
        y: 8
        color: "#93a0ba"
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
        palette.base: "#171b26"
        palette.text: "#eef0f6"
        palette.placeholderText: "#9aa7c2"
        placeholderText: qsTr("Type a note…")
        Accessible.name: qsTr("Note for the baker")
    }
}
