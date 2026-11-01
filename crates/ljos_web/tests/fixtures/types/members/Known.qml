import QtQuick

Rectangle {
    color: "red"
    border.width: 2
    onColorChanged: console.log(color)
    MouseArea { onClicked: parent.color = "blue" }
}
