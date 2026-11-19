import QtQuick

// An item's `resources` and `data` given as lists: what they hold is in
// them, as what is declared in the item is, and each is made once.
Item {
    id: root
    width: 400
    height: 300

    property int made: 0

    resources: [
        Timer { objectName: "t"; Component.onCompleted: root.made++ }
    ]
    data: [
        QtObject { objectName: "q"; Component.onCompleted: root.made++ },
        Item { objectName: "d"; Component.onCompleted: root.made++ }
    ]
    Item { objectName: "i"; Component.onCompleted: root.made++ }

    function names(list) {
        return Array.from(list, (object) => object.objectName)
    }
    function read() {
        return [names(root.resources), names(root.data), names(root.children), root.made]
    }
}
