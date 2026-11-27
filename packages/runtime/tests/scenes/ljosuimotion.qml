// Reduced motion in a file of Ljós's API (ljosui.spec.js): what would
// slide still slides, on a curve that never overshoots or bounces, a
// spring never swings past where it goes, and a fade or a change of
// colour still fades. A loop that never ends keeps its pace.
// `ljosuimotioncompat.qml` is the same file in QML as Qt has it.
import Ljos.Ui

Item {
    id: root
    width: 400
    height: 300

    property bool moved: false
    property alias slider: slider
    property alias blink: blink
    property real open: moved ? 1 : 0
    property real spin: 0
    // A slide whose curve goes past its end and back, and a lively spring.
    property real flung: moved ? 100 : 0
    property real sprung: moved ? 100 : 0

    Behavior on open {
        NumberAnimation { duration: 400 }
    }
    Behavior on flung {
        NumberAnimation {
            duration: 400
            easing.type: Easing.OutBack
            easing.overshoot: 3
        }
    }
    Behavior on sprung {
        SpringAnimation {
            spring: 5
            damping: 0.1
        }
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
