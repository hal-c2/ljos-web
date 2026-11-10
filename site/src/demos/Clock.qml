import QtQuick

Rectangle {
    id: root
    width: 320
    height: 180
    color: "#20242e"
    radius: 8
    property int seconds: 0

    Timer {
        interval: 1000
        running: true
        repeat: true
        onTriggered: root.seconds = root.seconds + 1
    }
    Column {
        anchors.centerIn: parent
        spacing: 10
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            color: "#e8eaf0"
            font.pixelSize: 32
            text: qsTr("Elapsed: ") + root.seconds + " s"
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            color: "#9aa3b2"
            font.pixelSize: 14
            text: "A Timer, a property, and a binding"
        }
    }
}
