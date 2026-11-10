import QtQuick
import Example

// `Gauge` of MIGRATION.md §6, as a page of the application shows it.
Rectangle {
    width: 320
    height: 120
    color: "white"

    Gauge {
        x: 20
        y: 20
        width: 280
        height: 24
        value: 0.5
    }

    Gauge {
        x: 20
        y: 64
        width: 200
        height: 32
        value: 0.25
    }
}
