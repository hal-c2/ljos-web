import QtQuick

// What a binding given through an alias of a declared property makes with
// `createObject` is not that property's: one made with a null parent has
// none, and one made with a parent has that one (Qt 6.12.0, qml6
// offscreen: `[null, "root"]`).
Item {
    id: root
    objectName: "root"
    property var orphan: null
    property var adopted: null
    Component { id: timer; Timer {} }
    PropertyItemAlias {
        id: through
        exposed: {
            root.orphan = timer.createObject(null)
            root.adopted = timer.createObject(root)
            return null
        }
    }
    function parents() {
        const name = t => t === null ? null : t.objectName
        return [name(orphan.parent), name(adopted.parent)]
    }
}
