// A Connections whose target is switched around a change of a list with no
// signal of its own (`children`). Qt hears a change from the object that is
// the target when the change is made, and from no other: a change made
// before the switch is the old target's, and one made after it, to the old
// target, is not heard. A move that changes the target too, through the
// moved item's parent, is heard from the old target: Qt 6.12.0 tells the
// children's change before the binding of the target runs again.
import QtQuick

Item {
    id: root
    width: 100
    height: 100

    property var heard: []
    property var heardBound: []

    Item { id: box; objectName: "box" }
    Item { id: other; objectName: "other" }
    Rectangle { id: first }
    Rectangle { id: second }

    Connections {
        id: switched
        target: box

        function onChildrenChanged() {
            root.heard.push(switched.target.objectName);
        }
    }

    Item { id: box3; objectName: "box3" }
    Item { id: other3; objectName: "other3" }
    Rectangle { id: third }

    // Moving `third` into box3 changes box3's children and, through its
    // parent, the target, in one write. Only box3's children changed, so
    // what is heard is box3's.
    // Qt 6.12.0: the handler runs before the binding of `target` does, so
    // `bound.target` in it is still box3; here it runs once the write has
    // settled, and `target` is other3 already.
    Connections {
        id: bound
        target: third.parent === box3 ? other3 : box3

        function onChildrenChanged() {
            root.heardBound.push(third.parent.objectName);
        }
    }

    // The same with a property that is no list: r's width moves the target
    // to wide, in one write.
    Rectangle { id: r; objectName: "r"; width: 10 }
    Rectangle { id: wide; objectName: "wide"; width: 10 }
    property var heardWidth: []

    Connections {
        id: scalar
        target: r.width > 50 ? wide : r

        function onWidthChanged() {
            root.heardWidth.push(r.width);
        }
    }

    // The same with a target that watched its width before the
    // Connections did: its own handler is no other listener's.
    Rectangle {
        id: r2
        objectName: "r2"
        width: 10
        property int own: 0
        onWidthChanged: own++
    }
    Rectangle { id: wide2; objectName: "wide2"; width: 10 }
    property var heardWidth2: []

    Connections {
        id: scalar2
        target: r2.width > 50 ? wide2 : r2

        function onWidthChanged() {
            root.heardWidth2.push(r2.width);
        }
    }

    function watchedWidthSwitches() {
        r2.width = 60;
        return [root.heardWidth2.splice(0), scalar2.target.objectName, r2.own];
    }

    function widthSwitches() {
        r.width = 60;
        return [root.heardWidth.splice(0), scalar.target.objectName];
    }

    function changeThenSwitch() {
        first.parent = box;
        switched.target = other;
        return root.heard.splice(0);
    }

    function switchThenChange() {
        switched.target = box;
        second.parent = other;
        return root.heard.splice(0);
    }

    function changeSwitches() {
        third.parent = box3;
        return [root.heardBound.splice(0), bound.target.objectName];
    }
}
