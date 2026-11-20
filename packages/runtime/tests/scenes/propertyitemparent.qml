import QtQuick

// An item made inline as a declared property's value: it is the property's,
// in no visual list, so its parent is null, as qml6 6.11 answers, until it
// is put in one. `resources` holds it without giving it a parent.
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
    Item {
        id: shown
        objectName: "shown"
    }
    function read() {
        return [first.made.parent === first, second.made.parent === second, second.made.parent, holder.resources.length, first.made.parent]
    }
    // Put in a visual list, it has that list's item as its parent.
    function put() {
        second.made.parent = shown
        return [second.made.parent === shown, shown.children.length]
    }
}
