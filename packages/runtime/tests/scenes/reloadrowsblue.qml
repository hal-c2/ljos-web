// reloadrows with blue rows.
import QtQuick

Item {
    width: 400
    height: 300

    Repeater {
        model: 3
        Rectangle { x: index * 20; width: 10; height: 10; color: "blue" }
    }
}
