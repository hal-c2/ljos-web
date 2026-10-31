// `box` is in `left`.
import QtQuick

Item {
    width: 400
    height: 300
    property alias box: box

    Item {
        id: left
        Rectangle { id: box; width: 10; height: 10 }
    }
    Item {
        id: right
        x: 100
    }
}
