// Where Ljós's own popovers (`import Ljos.Controls`) open: on the side of
// their button the window has room on, in the window's terms, which are
// what is drawn. The scene is the window's size, 400 by 300, so the room
// each has is the scene's.
import QtQuick
import Ljos.Controls

Item {
    id: root
    width: 400
    height: 300

    // Under an ancestor scaled from its top left corner: the button is at
    // 200 to 240 in the window, with no room under it. Summed up unscaled,
    // it would be at 100 to 120, with room.
    Item {
        width: 150
        height: 150
        scale: 2
        transformOrigin: Item.TopLeft
        Button {
            x: 10
            y: 100
            width: 60
            height: 20
            text: "Scaled"
            Popover { id: scaledPop; width: 100; height: 100; gap: 4; margins: 8 }
        }
    }

    // Its margins leave it no room under its button, where without them
    // there would be.
    Button {
        x: 200
        y: 150
        width: 80
        height: 20
        text: "Margins"
        Popover { id: marginPop; width: 100; height: 120; gap: 4; margins: 12 }
    }

    // Room where it is asked to open, under and before its button.
    Button {
        x: 200
        y: 20
        width: 80
        height: 20
        text: "Roomy"
        Popover { id: roomyPop; width: 100; height: 100; gap: 4; margins: 8 }
        Popover { id: beforePop; edge: Qt.LeftEdge; width: 100; height: 40; gap: 4; margins: 8 }
    }

    // Its side, where it is in its button's terms, and where that is in the
    // window's.
    function at(pop) {
        const p = pop.parent.mapToItem(root, pop.x, pop.y)
        return [pop.side, pop.x, pop.y, p.x, p.y]
    }

    function popovers() {
        return { scaled: at(scaledPop), margins: at(marginPop), roomy: at(roomyPop), before: at(beforePop) }
    }

    function popover(name) {
        return { scaled: scaledPop, margins: marginPop, roomy: roomyPop, before: beforePop }[name]
    }
}
