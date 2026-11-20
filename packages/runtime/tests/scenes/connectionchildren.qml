// A Connections that hears an item's `childrenChanged`, a change of a list
// that has no signal of its own, and writes in its handler. `doubled` is
// bound to what the handler writes: Qt runs the handler once the move has
// settled, so the handler reads the binding already up to date, and its
// write needs no flush of its own. It hears nothing as the scene is made:
// a list read again with the same items in it is no change. Once it is
// made, a list property given a new array with the same items is heard.
import QtQuick

Item {
    id: root
    width: 100
    height: 100

    property int heard: 0
    property int doubled: heard * 2
    property var seen: []
    property var items: [1, 2]
    property int itemsHeard: 0

    onItemsChanged: itemsHeard++

    Item { id: box }
    Rectangle { id: moved }

    Connections {
        target: box

        function onChildrenChanged() {
            root.heard++;
            root.seen.push(root.doubled);
        }
    }

    function before() {
        return root.heard;
    }

    function copy() {
        const was = root.itemsHeard;
        root.items = root.items.slice();
        return [was, root.itemsHeard];
    }

    function move() {
        moved.parent = box;
        return [root.heard, root.seen, box.children.length];
    }
}
