// A Connections whose target is replaced in the same handler that changes
// a list with no signal of its own (`children`), which is told once that
// handler's flush has settled. What changed while an object was the target
// is heard, as Qt hears it the moment it changes; what changed once another
// took its place is not.
import QtQuick

Item {
    id: root
    width: 100
    height: 100

    property var heard: []
    // Bound to `third.parent`: Qt tells `box.childrenChanged` as `third` is
    // added, before `third.parentChanged`, so this is evaluated again, and
    // the target replaced, only once the Connections has heard `box`.
    property int held: third.parent === box ? 1 : 0

    signal changeThenSwitch()
    signal switchThenChange()

    onChangeThenSwitch: {
        first.parent = box;
        hearing.target = other;
    }
    onSwitchThenChange: {
        hearing.target = box;
        second.parent = other;
        fourth.parent = box;
    }

    Item { id: box; objectName: "box" }
    Item { id: other; objectName: "other" }
    Rectangle { id: first }
    Rectangle { id: second }
    Rectangle { id: third }
    Rectangle { id: fourth }

    Connections {
        id: hearing
        target: box

        function onChildrenChanged() {
            root.heard.push(root.heard.length);
        }
    }

    function replaced() {
        hearing.target = Qt.binding(() => root.held > 0 ? other : box);
        third.parent = box;
        return root.heard.slice();
    }

    function changed() {
        root.changeThenSwitch();
        return root.heard.slice();
    }

    function switched() {
        root.switchThenChange();
        return root.heard.slice();
    }
}
