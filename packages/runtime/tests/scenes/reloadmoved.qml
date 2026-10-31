// `box` is in `right`, in `left` in reloadmove.
import QtQuick

Item {
    width: 400
    height: 300
    property alias box: box

    Item {
        id: left
    }
    Item {
        id: right
        x: 100
        Rectangle { id: box; width: 10; height: 10 }
    }
}
