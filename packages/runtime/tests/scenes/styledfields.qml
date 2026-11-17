import QtQuick
import QtQuick.Controls

// Ljós's own styles put a placeholder and a background over a field's
// edge: a press there is still a press on the field.
Column {
    width: 300
    height: 300
    padding: 12
    spacing: 8
    property alias field: field
    property alias area: area
    property alias clear: clear
    property int cleared: 0
    TextField { id: field; width: 200; placeholderText: "Search"; Accessible.name: "Search query" }
    TextArea { id: area; width: 200; placeholderText: "Notes"; wrapMode: TextEdit.Wrap; Accessible.name: "Notes" }
    // Something of the field's own that takes a press keeps it.
    TextField {
        width: 200
        Accessible.name: "With a button"
        MouseArea { id: clear; anchors.right: parent.right; width: 20; height: parent.height; onClicked: parent.parent.cleared++ }
    }
}
