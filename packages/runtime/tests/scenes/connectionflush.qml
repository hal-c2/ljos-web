// A Connections whose target is switched in the same flush as a change of a
// list with no signal of its own (`children`): a state's changes, applied
// in the order they are written. A change made while an object was the
// target is heard, and from no other: Qt hears a change the moment it is
// made. One state is entered on each scene.
import QtQuick

Item {
    id: root
    width: 100
    height: 100

    property var heard: []

    Item { id: box; objectName: "box" }
    Item { id: other; objectName: "other" }
    Rectangle { id: first }
    Rectangle { id: second }

    Connections {
        id: hearing
        target: box

        function onChildrenChanged() {
            // Heard, not `hearing.target`: Ljós runs the handler of a
            // `children` change once the flush has settled, when the target
            // is the new one whichever object changed. Each state changes
            // one object, so what is heard is that object's change.
            root.heard.push("heard");
        }
    }

    states: [
        // `explicit`: the target is given `other` where it is written, as
        // Qt gives it.
        State {
            name: "changeThenSwitch"
            ParentChange { target: first; parent: box }
            PropertyChanges { hearing.target: other; explicit: true }
        },
        State {
            name: "switchThenChange"
            PropertyChanges { hearing.target: other; explicit: true }
            ParentChange { target: second; parent: box }
        },
        State {
            name: "switchThenChangeNew"
            PropertyChanges { hearing.target: other; explicit: true }
            ParentChange { target: second; parent: other }
        },
        // Not `explicit`: the target is given a binding, which Qt evaluates
        // once the move is made, so the move is still the old target's.
        State {
            name: "bindThenChange"
            PropertyChanges { hearing.target: other }
            ParentChange { target: second; parent: box }
        }
    ]

    function entered(name) {
        root.state = name;
        return root.heard.slice();
    }
}
