import QtQuick

// An item made inline in another's `resources`, inside a third: held, not
// drawn, and with no parent, as qml6 6.11 answers.
Item {
    id: root
    objectName: "root"
    width: 400
    height: 300
    Item {
        id: outer
        objectName: "outer"
        Item {
            id: other
            objectName: "other"
            resources: [
                Item {
                    id: inline
                    objectName: "inline"
                    property string up: parent ? parent.objectName : "none"
                },
                QtObject { objectName: "plain" }
            ]
        }
    }
    function names(list) {
        return Array.from(list, (object) => object.objectName)
    }
    function read() {
        return [inline.parent ? inline.parent.objectName : "none", inline.up, names(other.resources), names(other.children), names(outer.children), names(root.children)]
    }
}
