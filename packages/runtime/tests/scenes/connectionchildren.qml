// A Connections that hears an item's `childrenChanged`, a change of a list
// that has no signal of its own, and writes in its handler. `doubled` is
// bound to what the handler writes: Qt runs the handler once the move has
// settled, so the handler reads the binding already up to date, and its
// write needs no flush of its own.
import QtQuick

Item {
    id: root
    width: 100
    height: 100

    property int heard: 0
    property int doubled: heard * 2
    property var seen: []

    Item { id: box }
    Rectangle { id: moved }

    Connections {
        target: box

        function onChildrenChanged() {
            root.heard++;
            root.seen.push(root.doubled);
        }
    }

    function move() {
        moved.parent = box;
        return [root.heard, root.seen, box.children.length];
    }
}
