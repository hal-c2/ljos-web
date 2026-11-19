import QtQuick

// A component's `resources` and its instance's both hold what they say,
// each made once; an item named in another's `resources` is still drawn
// by its own parent, and one the item also declares stays its child.
Item {
    id: root
    width: 400
    height: 300

    component Held: Item {
        id: me
        property int made: 0
        resources: [
            Timer { objectName: "a"; Component.onCompleted: me.made++ }
        ]
    }
    Held {
        id: held
        resources: [
            Timer { objectName: "b"; Component.onCompleted: held.made++ }
        ]
    }
    Rectangle { id: shared; objectName: "shared"; width: 10; height: 10 }
    Item { id: other; objectName: "other"; resources: [shared] }
    Item {
        id: both
        objectName: "both"
        Rectangle { id: inner; objectName: "inner" }
        resources: [inner]
    }

    // Holders made and destroyed again, of something that outlives them.
    Rectangle { id: kept; objectName: "kept" }
    Component {
        id: holding
        Item { resources: [kept] }
    }
    function holdAndLet(times) {
        for (let i = 0; i < times; i++) holding.createObject(root).destroy()
    }
    function keptOne() {
        return kept
    }

    function names(list) {
        return Array.from(list, (object) => object.objectName)
    }
    // What is destroyed is gone from every `resources` that held it.
    function drop() {
        heard = []
        held.resources[0].destroy()
        shared.destroy()
    }
    // What binds to a holder's resources hears of it, whoever draws it.
    readonly property int heldCount: held.resources.length
    readonly property int otherCount: other.resources.length
    property var heard: []
    onHeldCountChanged: heard = heard.concat(["held " + heldCount])
    onOtherCountChanged: heard = heard.concat(["other " + otherCount])
    function dropped() {
        return [names(held.resources), names(other.resources), heard.slice().sort()]
    }
    function read() {
        return [names(held.resources), held.made, shared.parent === root, names(other.resources), names(other.children), names(root.children), names(both.children), names(both.resources), inner.parent === both]
    }
}
