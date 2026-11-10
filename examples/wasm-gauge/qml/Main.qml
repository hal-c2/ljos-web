import QtQuick
import Example
import Example.Dials

Item {
    id: root
    width: 400
    height: 300

    property int paints: 0
    property real pressedX: -1
    property alias dial: dial
    property alias gauge: gauge
    property real halved: gauge.value / 2

    Gauge {
        id: gauge
        x: 10
        y: 10
        width: 200
        height: 20
        value: 0.5
    }

    // Reads nothing the bar reads: a change here paints nothing of it.
    Rectangle {
        id: other
        objectName: "other"
        x: 240
        y: 10
        width: 20
        height: 20
        color: "green"
    }

    Dial {
        id: dial
        x: 10
        y: 50
        width: 200
        height: 200
        onPressedAt: (x) => root.pressedX = x
    }

    function setOther(width) {
        other.width = width
    }

    function setValue(value) {
        gauge.value = value
    }
}
