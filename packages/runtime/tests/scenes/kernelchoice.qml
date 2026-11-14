import QtQuick

// A page on whichever kernel it came to: a binding, and a click that
// changes what the binding reads.
Rectangle {
    id: root
    width: 200; height: 100
    property int count: 0
    readonly property int twice: count * 2

    Text {
        id: label
        text: "Count " + root.count + ", twice " + root.twice
        font.pixelSize: 16
    }
    MouseArea {
        anchors.fill: parent
        onClicked: root.count++
    }

    function read() { return label.text }
}
