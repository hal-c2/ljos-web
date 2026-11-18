import QtQuick

// What an item holds besides the items it draws: its `resources` are the
// objects declared in it that are not items, its `data` all of them.
Item {
    id: root
    width: 400
    height: 300

    QtObject { objectName: "a" }
    Item { objectName: "i" }
    Timer { objectName: "t" }
    Rectangle { objectName: "r" }

    function names(list) {
        return Array.from(list, (object) => object.objectName)
    }
    function read() {
        return [names(root.resources), names(root.data), names(root.children)]
    }
    Component { id: drawn; Item { objectName: "drawn" } }
    function add() {
        drawn.createObject(root)
    }
}
