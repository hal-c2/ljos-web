import QtQuick

Item {
    id: root
    property var thing: null
    property real wide: thing.width
    width: wide
}
