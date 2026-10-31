// `grow` is what a handler would do: it assigns to `box`. Only the colour is edited.
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
        width: 10
        height: 10
        color: "blue"
    }
}
