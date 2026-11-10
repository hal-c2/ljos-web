import QtQuick

Rectangle {
    id: root
    width: 320
    height: 180
    color: root.on ? "#2e2a20" : "#20242e"
    radius: 8
    property bool on: false

    Column {
        anchors.centerIn: parent
        spacing: 14
        Rectangle {
            anchors.horizontalCenter: parent.horizontalCenter
            width: 72
            height: 38
            radius: 19
            color: root.on ? "#e8a33d" : "#39404f"
            Rectangle {
                x: root.on ? parent.width - width - 4 : 4
                y: 4
                width: 30
                height: 30
                radius: 15
                color: "#f4f2ec"
                Behavior on x { NumberAnimation { duration: 160 } }
            }
            MouseArea {
                anchors.fill: parent
                onClicked: root.on = !root.on
            }
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            color: "#e8eaf0"
            font.pixelSize: 18
            text: root.on ? "Ljós: on" : "Ljós: off"
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            color: "#9aa3b2"
            font.pixelSize: 14
            text: "State drives colour, position and words"
        }
    }
}
