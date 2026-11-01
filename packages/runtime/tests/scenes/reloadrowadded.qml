// reloadrow with an item of another type between the two, and one more of
// theirs after them.
import QtQuick

Item {
    width: 400
    height: 300

    Rectangle { x: 0; width: 10; height: 10; color: "red" }
    Text { text: "between" }
    Rectangle { x: 20; width: 10; height: 10; color: "green" }
    Rectangle { x: 40; width: 10; height: 10; color: "blue" }
}
