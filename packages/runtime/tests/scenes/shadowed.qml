import QtQuick

// A file that declares a property its type already has: its own, as Ljós's
// Observer declares `scale` on its Frames page for the length of its bars.
Item {
    id: root
    width: 300
    height: 100
    property alias page: page
    property alias bar: bar
    property alias scaled: scaled

    Item {
        id: page
        width: 200
        height: 50
        property real scale: 16667
        property real rotation: 45
        function grow(by) {
            scale = Math.max(scale, by)
        }
        Rectangle { id: bar; width: page.scale / 1000; height: 10 }
    }

    // Not declared again: the item's own, drawn.
    Item { id: scaled; width: 10; height: 10; scale: 2 }
}
