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
    property bool useOther: false
    property var followed: []

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

    // Its target a binding of its own: where it is told to look is
    // written, and which object it hears follows.
    Connections {
        id: following
        target: root.useOther ? other : box

        function onChildrenChanged() {
            root.followed.push("heard");
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
        },
        // What the target's own binding reads is written, then the old
        // target changes: Qt evaluates the binding at the write, so the
        // change is the new target's no longer. Qt 6.12.0 (qml6 offscreen) hears
        // nothing here, and the new target's change in the next.
        State {
            name: "rebindThenChange"
            PropertyChanges { root.useOther: true; explicit: true }
            ParentChange { target: second; parent: box }
        },
        // The same, and the new target changes: that is heard.
        State {
            name: "rebindThenChangeNew"
            PropertyChanges { root.useOther: true; explicit: true }
            ParentChange { target: second; parent: other }
        }
    ]

    // The same in a script: each write is settled as it is made.
    function rebindThenChange() {
        root.useOther = true;
        second.parent = box;
        return root.followed.slice();
    }

    function followedAfter(name) {
        root.state = name;
        return root.followed.slice();
    }

    function entered(name) {
        root.state = name;
        return root.heard.slice();
    }
}
