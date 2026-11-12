import QtQuick

// A note the visitor types. The text belongs to this block, not to
// any shell, so rewriting the shell around it never loses a word.
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
    TextInput {
        id: field
        objectName: "noteField"
        x: 12
        y: 30
        width: parent.width - 24
        height: 34
        color: "#eef0f6"
        font.pixelSize: 16
        clip: true
        // No placeholder text: the label above says what this is,
        // and an overlay would sit over the field it describes.
        Accessible.name: qsTr("Note for the baker")
    }
}
