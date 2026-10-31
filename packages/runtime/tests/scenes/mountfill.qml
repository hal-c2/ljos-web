import QtQuick

Rectangle {
    width: 120; height: 80
    color: "teal"
    property real half: width / 2
    Rectangle { objectName: "edge"; x: parent.width - 10; width: 10; height: 10 }
}
