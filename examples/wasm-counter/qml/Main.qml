import QtQuick
import Example

Item {
    id: root
    width: 400
    height: 300

    // What the handlers below were told, for the test to read.
    property int bumps: 0
    property int lastBump: -1
    property int changes: 0

    Counter {
        id: counter
        step: 2
        onCountChanged: root.changes = root.changes + 1
        onBumped: (value) => {
            root.bumps = root.bumps + 1
            root.lastBump = value
        }
    }

    Rectangle {
        anchors.fill: parent
        color: "#20242e"

        Text {
            id: countText
            x: 24
            y: 24
            color: "#e8eaf0"
            font.pixelSize: 32
            text: "Count: " + counter.count
        }

        Text {
            x: 24
            y: 72
            color: "#9aa3b2"
            font.pixelSize: 16
            text: "Bumped: " + root.lastBump
        }

        MouseArea {
            anchors.fill: parent
            onClicked: counter.increment()
        }
    }

    function read() {
        return [counter.count, counter.step, root.bumps, root.lastBump, root.changes, countText.text]
    }

    function setStep(step) {
        counter.step = step
    }
}
