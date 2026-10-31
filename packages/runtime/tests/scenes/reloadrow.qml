// Siblings with neither an id nor a name: each is known by its place among
// those of its type.
import QtQuick

Item {
    width: 400
    height: 300

    Rectangle { x: 0; width: 10; height: 10; color: "red" }
    Rectangle { x: 20; width: 10; height: 10; color: "green" }
}
