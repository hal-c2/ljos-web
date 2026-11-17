// A dialog of `import QtQuick.Controls` in Ljós's own style: its footer
// is the style's button box, which makes the dialog's standard buttons.
import QtQuick
import QtQuick.Controls

Item {
    id: root
    width: 400
    height: 300
    property string said: ""
    property alias confirm: confirm

    Dialog {
        id: confirm
        objectName: "confirm"
        title: "Delete the file?"
        standardButtons: Dialog.Ok | Dialog.Cancel
        onAccepted: root.said = "accepted"
        onRejected: root.said = "rejected"

        Label { text: "This cannot be undone." }
    }

    function show() { confirm.open() }
}
