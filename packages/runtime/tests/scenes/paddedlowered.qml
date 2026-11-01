import QtQuick
import QtQuick.Controls.impl

// A PaddedRectangle's padding is clear, with a child under it or not.
Rectangle {
    width: 100; height: 100
    color: "#00ff00"

    PaddedRectangle {
        width: 100; height: 100
        color: "#ff0000"
        topPadding: 50
        Rectangle { z: -1; x: 0; y: 60; width: 10; height: 10; color: "#0000ff" }
    }
}
