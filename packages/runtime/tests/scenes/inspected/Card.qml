import QtQuick

Item {
    id: inner
    width: 50; height: 50
    property alias shade: label.color
    Rectangle {
        id: label
        objectName: "cardLabel"
        anchors.fill: parent
        color: "red"
    }
}
