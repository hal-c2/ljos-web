import QtQuick
import Site

// Light or dark, the reader's: it shows the scheme a press goes to (a
// moon in light, a sun in dark), and the choice is kept (Theme.toggle).
IconButton {
    id: toggle

    label: Theme.dark ? "Use the light theme" : "Use the dark theme"
    onPressed: Theme.toggle()

    // The moon: a disc with a bite out of it.
    Item {
        anchors.centerIn: parent
        width: 18
        height: 18
        visible: !Theme.dark

        Rectangle {
            anchors.fill: parent
            radius: 9
            color: Theme.text
        }
        Rectangle {
            x: 6
            y: -3
            width: 15
            height: 15
            radius: 7.5
            color: toggle.color
        }
    }
    // The sun: a disc and its rays.
    Item {
        anchors.centerIn: parent
        width: 22
        height: 22
        visible: Theme.dark

        Rectangle {
            anchors.centerIn: parent
            width: 10
            height: 10
            radius: 5
            color: Theme.text
        }
        Repeater {
            model: 8
            Rectangle {
                required property int index
                x: 10
                y: 0
                width: 2
                height: 4
                radius: 1
                color: Theme.text
                transform: Rotation {
                    origin.x: 1
                    origin.y: 11
                    angle: index * 45
                }
            }
        }
    }
}
