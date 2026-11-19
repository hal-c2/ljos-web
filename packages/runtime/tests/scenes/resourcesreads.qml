import QtQuick

// What another's `resources` reads that is made as it is read: an item
// property's own item, made the first time it is read. It is that
// property's, whoever reads it first: its parent is the one it has when
// read anywhere else, though a `resources` read made it.
Item {
    id: root
    objectName: "root"
    width: 400
    height: 300
    Item {
        id: first
        objectName: "first"
        property Item made: Item { objectName: "madeFirst" }
    }
    Item {
        id: second
        objectName: "second"
        property Item made: Item { objectName: "madeSecond" }
    }
    Item {
        id: holder
        objectName: "holder"
        resources: [first.made]
    }
    // Whether each property's item has the parent its owner gives it.
    function read() {
        return [first.made.parent === first, second.made.parent === second]
    }
}
