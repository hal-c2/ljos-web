// A page that has a document drawing in space among what it loads, and
// does not make it: as an application's routes hold the pages that are
// not the one shown.
import QtQuick

Rectangle {
    width: 200
    height: 150
    color: "#000000"

    Loader {
        anchors.fill: parent
        active: false
        sourceComponent: Component { Held3D {} }
    }
}
