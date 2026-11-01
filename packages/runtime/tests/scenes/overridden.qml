// A property of any object with something put over it: a box whose width is
// bound to its parent's, the parent's width changing under it.
import QtQuick

Item {
    id: root
    width: 300
    height: 100

    property alias box: box

    Rectangle { id: box; width: root.width / 2; height: 10; color: "red" }
}
