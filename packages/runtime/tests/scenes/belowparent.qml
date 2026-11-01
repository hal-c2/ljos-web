import QtQuick

Rectangle {
    width: 200
    height: 100
    color: "white"

    Rectangle {
        x: 20
        y: 20
        width: 60
        height: 60
        color: "lime"

        // Sticks out of its parent, and is under it where they overlap.
        Rectangle {
            z: -1
            x: -10
            y: -10
            width: 80
            height: 80
            color: "red"
        }
        // A child that keeps its place is still over its parent.
        Rectangle {
            x: 40
            y: 40
            width: 20
            height: 20
            color: "blue"
        }
    }
}
