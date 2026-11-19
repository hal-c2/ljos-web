// `ljosuimotion.qml` in QML as Qt has it: what reduced motion does is
// the program's to say (ljosui.spec.js).
import QtQuick

Item {
    id: root
    width: 400
    height: 300

    property bool moved: false
    property alias slider: slider
    property alias blink: blink
    property real open: moved ? 1 : 0
    property real spin: 0

    Behavior on open {
        NumberAnimation { duration: 400 }
    }
    NumberAnimation on spin {
        from: 0
        to: 360
        duration: 1000
        loops: Animation.Infinite
    }

    Rectangle {
        id: slider
        x: root.moved ? 200 : 0
        width: 50
        height: 50
        opacity: root.moved ? 0.2 : 1
        color: root.moved ? "steelblue" : "tomato"

        Behavior on x {
            NumberAnimation { duration: 400 }
        }
        Behavior on opacity {
            NumberAnimation { duration: 400 }
        }
        Behavior on color {
            ColorAnimation { duration: 400 }
        }
    }

    // A fade the file asks to take no time takes none.
    Rectangle {
        id: blink
        width: 20
        height: 20
        opacity: root.moved ? 0.5 : 1

        Behavior on opacity {
            NumberAnimation { duration: 0 }
        }
    }
}
