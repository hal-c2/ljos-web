import QtQuick

// A reader's mouse resting on one area while a click is driven on another:
// the driven click is not the reader's mouse.
Rectangle {
    id: root
    width: 400; height: 200
    color: "white"
    property int clicks: 0

    MouseArea {
        id: rested
        x: 0; y: 0; width: 100; height: 100
        hoverEnabled: true
    }
    MouseArea {
        id: driven
        x: 200; y: 0; width: 100; height: 100
        hoverEnabled: true
        onClicked: root.clicks++
    }
}
