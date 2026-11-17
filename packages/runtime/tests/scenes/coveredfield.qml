// Fields with an item over them, as a style puts its placeholder: a Text
// takes no press, so the field under it does; a MouseArea takes it, so the
// field does not.
import QtQuick
import QtQuick.Templates as T

Item {
    id: root
    width: 400
    height: 300

    property alias covered: covered
    property alias area: area
    property alias taken: taken
    property int presses: 0

    T.TextField {
        id: covered
        x: 10
        y: 10
        width: 200
        height: 40
        padding: 6
        // Empty, as a placeholder is with no placeholderText: still there.
        Text {
            x: covered.leftPadding
            y: covered.topPadding
            width: covered.width - covered.leftPadding - covered.rightPadding
            height: covered.height - covered.topPadding - covered.bottomPadding
            text: ""
        }
    }

    T.TextArea {
        id: area
        x: 10
        y: 60
        width: 200
        height: 60
        padding: 6
        Text {
            anchors.fill: parent
            text: "placeholder"
        }
    }

    T.TextField {
        id: taken
        x: 10
        y: 140
        width: 200
        height: 40
        MouseArea {
            anchors.fill: parent
            onPressed: root.presses++
        }
    }
}
