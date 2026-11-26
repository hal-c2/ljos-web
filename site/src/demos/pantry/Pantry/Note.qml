import Ljos.Ui
import Ljos.Core
import Ljos.Controls

// A note the visitor types. The text belongs to this block, not to
// any shell, so rewriting the shell around it never loses a word.
// A TextField, not a bare TextInput: the control labels its field
// for assistive technology as the same control does anywhere.
Rectangle {
    id: note
    width: 300
    height: 76
    radius: 8
    fill: "#202636"

    readonly property string text: field.text

    Text {
        x: 12
        y: 8
        color: "#93a0ba"
        font.size: 12
        text: t`Note for the baker`
    }
    TextField {
        id: field
        objectName: "noteField"
        x: 12
        y: 26
        width: parent.width - 24
        height: 40
        // The Pantry is dark in a light page too: the field keeps its
        // colours, and Ljós's focus edge.
        color: "#eef0f6"
        placeholderTextColor: "#9aa7c2"
        background: Rectangle {
            radius: 6
            fill: "#171b26"
            border.width: field.activeFocus ? 2 : 1
            border.color: field.activeFocus ? "#8ab4ff" : "#3a4256"
        }
        // No Accessible.name: the control says its placeholder,
        // as every TextField does; naming the wrapper here would
        // label the box around the field instead of the field.
        placeholderText: t`Note for the baker…`
    }
}
