import QtQuick
import Example.Dials

// The rest of what a hook paints, no text: text has its own scene.
Rectangle {
    width: 240
    height: 240
    color: "#fafafa"

    Dial {
        x: 20
        y: 20
        width: 200
        height: 200
        turns: 0.125
    }
}
