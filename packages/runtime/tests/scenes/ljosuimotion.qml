// Reduced motion in a file of Ljós's API (ljosui.spec.js): what would
// slide is where it goes at once, a number of the file's own too, and a
// fade or a change of colour still fades. A loop that never ends keeps
// its pace. `ljosuimotioncompat.qml` is the same file in QML as Qt has it.
import Ljos.Ui

Item {
    id: root
    width: 400
    height: 300

    property bool moved: false
    property alias slider: slider
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
        fill: root.moved ? "steelblue" : "tomato"

        Behavior on x {
            NumberAnimation { duration: 400 }
        }
        Behavior on opacity {
            NumberAnimation { duration: 400 }
        }
        Behavior on fill {
            ColorAnimation { duration: 400 }
        }
    }
}
