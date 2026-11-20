import QtQuick

// An item's own `onChildrenChanged` hears a child moved into it, made into
// it or moved out, as qml6 does, and at once; one declared inside it as it
// is made is no change. The item it was moved out of hears it too, and a
// Timer made in it is none of its children.
Item {
    id: root
    property int rootHeard: 0
    property int heardByConnections: 0
    onChildrenChanged: rootHeard++

    Rectangle { id: other }

    Item {
        id: own
        property int heard: 0
        onChildrenChanged: heard++
    }

    Item {
        id: full
        property int heard: 0
        onChildrenChanged: heard++
        Item {}
        Item {}
    }

    Connections {
        target: own
        function onChildrenChanged() { root.heardByConnections++ }
    }

    Component { id: made; Item {} }
    Component { id: loose; Timer {} }

    function move() {
        const before = root.rootHeard;
        other.parent = own;
        const moved = own.heard, left = root.rootHeard - before;
        other.parent = own;
        const again = own.heard;
        made.createObject(own);
        const created = own.heard;
        loose.createObject(own);
        const timed = own.heard;
        other.parent = null;
        const out = own.heard;
        return [moved, left, again, created, timed, out, full.heard, root.heardByConnections];
    }
}
