// `box`'s width is bound to `base`, twice as much as in reloadbind.
import QtQuick

Item {
    width: 400
    height: 300
    property int base: 2
    property alias box: box

    Rectangle {
        id: box
        width: base * 20
        height: base * 10
    }
}
