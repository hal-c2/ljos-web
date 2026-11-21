import QtQuick

// An alias of an alias, given a value by instances a Repeater makes in a
// flush (a state's change of its model) or in a script, read by each
// instance's own `Component.onCompleted`: it reads what it was given.
Item {
    id: root
    property int count: 0
    property var seen: []
    property QtObject given: QtObject { objectName: "given" }

    Repeater {
        model: root.count
        delegate: ObjectAliasOuter {
            thing: root.given
            Component.onCompleted: root.seen.push(thing === root.given)
        }
    }

    states: State {
        name: "more"
        PropertyChanges { root.count: 1 }
    }

    function inState() {
        root.state = "more"
        return root.seen.slice()
    }
    function inScript() {
        root.count = 1
        return root.seen.slice()
    }
}
