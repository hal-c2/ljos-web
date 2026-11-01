// `box`'s width is bound to `base`.
import QtQuick

Item {
    width: 400
    height: 300
    property int base: 2
    property alias box: box

    Rectangle {
        id: box
        width: base * 10
        height: base * 10
    }
}
