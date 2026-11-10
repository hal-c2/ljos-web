import QtQuick

Rectangle {
    id: root
    width: 320
    height: 180
    color: "#20242e"
    radius: 8
    property int count: 0

    Column {
        anchors.centerIn: parent
        spacing: 10
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            color: "#e8eaf0"
            font.pixelSize: 32
            text: "Count: " + root.count
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            color: "#9aa3b2"
            font.pixelSize: 14
            text: "Click anywhere to count"
        }
    }
    MouseArea {
        anchors.fill: parent
        onClicked: root.count = root.count + 1
    }
}
