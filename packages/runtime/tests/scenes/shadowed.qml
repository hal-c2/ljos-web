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
    property alias panel: panel
    property alias inner: inner

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

    // Its own `visible` and `opacity`, of what it is about: it is still
    // shown, whole, and so is what is in it.
    Item {
        id: panel
        objectName: "panel"
        x: 0; y: 60; width: 100; height: 40
        property bool visible: false
        property real opacity: 0
        Rectangle { id: inner; objectName: "inner"; width: 100; height: 40; color: "teal" }
    }

    // Drawn at opacity 0, and what is in it with it, whatever its own
    // opacity: what is under them is what is seen.
    Rectangle { id: below; objectName: "below"; x: 150; y: 60; width: 100; height: 40; color: "orange" }
    Item {
        id: faded
        x: 150; y: 60; width: 100; height: 40
        opacity: 0
        Rectangle { id: unseen; objectName: "unseen"; width: 100; height: 40; color: "teal" }
    }

    // Not declared again: the item's own, drawn.
    Item { id: scaled; width: 10; height: 10; scale: 2 }
}
