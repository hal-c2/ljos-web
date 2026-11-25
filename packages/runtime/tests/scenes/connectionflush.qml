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
    property bool ready: true
    property var signalled: []
    property var fromNull: []
    property var throughNull: []
    property var selected: root.useOther ? other : box
    property var throughSelected: []
    property var keptOld: []

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

    // The same with a signal (`widthChanged`): told as it is emitted, to
    // whichever object is the target then.
    Connections {
        id: signalling
        target: root.useOther ? other : box

        function onWidthChanged() {
            root.signalled.push("heard");
        }
    }

    // A binding whose target is none at first: it moves to `other` at the
    // write all the same.
    Connections {
        id: nothingFirst
        target: root.useOther ? other : null

        function onChildrenChanged() {
            root.fromNull.push("heard");
        }
    }

    // A binding that moves through none on its way to `other`.
    Connections {
        id: nothingBetween
        target: root.useOther ? (root.ready ? other : null) : box

        function onChildrenChanged() {
            root.throughNull.push("heard");
        }
    }

    // A binding that reads another binding: Qt evaluates both at the write.
    Connections {
        id: chained
        target: root.selected

        function onChildrenChanged() {
            root.throughSelected.push("heard");
        }
    }

    // A binding that gives `undefined`: Qt refuses it ("Unable to assign
    // [undefined] to QObject*") and keeps the target it had.
    Connections {
        id: refused
        target: root.useOther ? undefined : box

        function onChildrenChanged() {
            root.keptOld.push("heard");
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
        },
        State {
            name: "rebindThenWiden"
            PropertyChanges { root.useOther: true; explicit: true }
            PropertyChanges { box.width: 5 }
        },
        State {
            name: "rebindThenWidenNew"
            PropertyChanges { root.useOther: true; explicit: true }
            PropertyChanges { other.width: 5 }
        },
        State {
            name: "rebindFromNullThenChange"
            PropertyChanges { root.useOther: true; explicit: true }
            ParentChange { target: second; parent: other }
        },
        State {
            name: "rebindThroughNullThenChange"
            PropertyChanges { root.ready: false; explicit: true }
            PropertyChanges { root.useOther: true; explicit: true }
            PropertyChanges { root.ready: true; explicit: true }
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

    // The refused target is kept after the flush too: a change made after
    // it is the old target's still.
    function refusedThenChange() {
        root.state = "rebindThenChange";
        first.parent = box;
        return root.keptOld.slice();
    }

    function heardAfter(name, list) {
        root.state = name;
        return root[list].slice();
    }

    function entered(name) {
        root.state = name;
        return root.heard.slice();
    }
}
