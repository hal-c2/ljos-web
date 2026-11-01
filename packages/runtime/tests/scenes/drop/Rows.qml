import QtQuick
import Shop

// A block's uses that come and go: rows, and what a program makes.
Column {
    id: rows
    objectName: "rows"
    property int many: 2
    property int completed: 0
    Repeater {
        objectName: "repeater"
        model: rows.many
        Card {
            objectName: "row"
            Component.onCompleted: rows.completed++
        }
    }
    Component {
        id: maker
        Card {
            objectName: "row"
            Component.onCompleted: rows.completed++
        }
    }
    function make(within) {
        return maker.createObject(within)
    }
}
