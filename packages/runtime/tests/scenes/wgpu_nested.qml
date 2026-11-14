// A page whose own document draws nothing in space, with one that does
// inside it: what asks is the inner document, as it is made.
import QtQuick

Rectangle {
    width: 200
    height: 150
    color: "#000000"

    Held3D { anchors.fill: parent }
}
