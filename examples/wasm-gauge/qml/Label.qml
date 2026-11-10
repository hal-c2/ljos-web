import QtQuick
import Example.Dials

// Text through the hook: the browser's fonts against the bundled one.
Rectangle {
    width: 240
    height: 80
    color: "#fafafa"

    Dial {
        x: 20
        y: 10
        width: 200
        height: 60
        label: "Hook text"
    }
}
