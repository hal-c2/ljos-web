import QtQuick

Rectangle {
    id: root
    width: 320
    height: 180
    color: "#20242e"
    radius: 8
    property real value: 0.65

    Column {
        anchors.centerIn: parent
        spacing: 12
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            color: "#e8eaf0"
            font.pixelSize: 28
            text: Math.round(root.value * 100) + " %"
        }
        Rectangle {
            width: 240
            height: 18
            radius: 9
            color: "#39404f"
            Rectangle {
                width: parent.width * root.value
                height: parent.height
                radius: 9
                color: "#e8a33d"
            }
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            color: "#9aa3b2"
            font.pixelSize: 14
            text: "An animated binding, no imperative updates"
        }
    }
    SequentialAnimation on value {
        loops: Animation.Infinite
        NumberAnimation { to: 0.92; duration: 1600; easing.type: Easing.InOutQuad }
        NumberAnimation { to: 0.18; duration: 1600; easing.type: Easing.InOutQuad }
    }
}
