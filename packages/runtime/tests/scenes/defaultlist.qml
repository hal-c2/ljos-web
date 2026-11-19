import QtQuick

// Qt 6.11: a component whose default property is a list it names `data`
// holds there what an instance declares inside it, and adopts none of it;
// what its own file declares is the item's, among its resources.
Item {
    id: root
    width: 100
    height: 100

    component Box: Item {
        default property list<QtObject> data
        Timer { objectName: "own" }
    }
    Box {
        id: box
        Rectangle { objectName: "given" }
    }

    function read() {
        const names = (list) => Array.from(list, (object) => object.objectName)
        return [names(box.data), names(box.children), names(box.resources)]
    }
}
