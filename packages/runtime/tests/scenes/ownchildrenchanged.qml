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

    // Made into by a binding: the binding's work settled, it heard once.
    Item {
        id: kept
        property int heard: 0
        onChildrenChanged: heard++
    }
    property bool go: false
    property int during: go ? makeIn() : -1
    function makeIn() { made.createObject(kept); return kept.children.length }

    // The same, where what the item does on hearing of it changes what the
    // binding goes on to read: the binding is what it is once that is done.
    property int factor: 1
    readonly property var once: ({ made: false })
    Item {
        id: changing
        property int heard: 0
        onChildrenChanged: { heard++; root.factor = 2 }
    }
    property bool goOn: false
    property int after: goOn ? makeOnce() * factor : -1
    function makeOnce() { if (!once.made) { once.made = true; made.createObject(changing) } return 1 }

    // A type of its own whose `children` is a property it declares: a list
    // given again holding the same is a change, as a `var` is.
    component Own: Item { property var children: [] }
    Own {
        id: overriding
        property int heard: 0
        onChildrenChanged: heard++
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

    function bound() {
        go = true;
        return [during, kept.heard, kept.children.length];
    }

    function reread() {
        goOn = true;
        return [after, changing.heard, changing.children.length, factor];
    }

    function overridden() {
        overriding.children = [1, 2];
        const first = overriding.heard;
        overriding.children = [1, 2];
        return overriding.heard - first;
    }
}
