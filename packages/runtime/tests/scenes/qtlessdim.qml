import QtQuick
import QtQuick.Controls

Rectangle {
    width: 200
    height: 200
    color: "white"

    Popup {
        modal: true
        x: 150
        y: 150
        width: 40
        height: 40
        Component.onCompleted: open()
    }
}
