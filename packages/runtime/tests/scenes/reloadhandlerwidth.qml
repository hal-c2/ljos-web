// `grow` is what a handler would do: it assigns to `box`. The width and the colour are edited.
import QtQuick

Item {
    width: 400
    height: 300
    property alias box: box

    function grow() {
        box.width = 80
        box.height = 90
    }

    Rectangle {
        id: box
        width: 20
        height: 10
        color: "blue"
    }
}
