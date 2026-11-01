import QtQuick

// A block a shell uses more than once: each use has its own.
Rectangle {
    objectName: "card"
    width: 10
    height: 10
    property int hits: 0
    readonly property int count: hits
    function hit() {
        hits = hits + 1
    }
}
