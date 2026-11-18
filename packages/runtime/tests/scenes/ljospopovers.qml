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

    // Under an ancestor a transform moves: it opens above its button, which
    // has no room under it, and under it once the transform has moved it up.
    property real shift: 0
    Item {
        width: 400
        height: 300
        transform: Translate { y: root.shift }
        Button {
            x: 280
            y: 200
            width: 60
            height: 20
            text: "Moved"
            Popover { id: movedPop; width: 100; height: 100; gap: 4; margins: 8 }
        }
    }

    // Under an ancestor a ScaleAnimator grows to twice its size from its top
    // left corner. Unscaled, the button is at 210 to 270 and 100 to 120 in
    // the window, with room under it; at twice the size it is at 220 to 340
    // and 200 to 240, with none.
    Item {
        id: growing
        x: 200
        width: 150
        height: 150
        transformOrigin: Item.TopLeft
        ScaleAnimator { id: grower; target: growing; from: 1; to: 2; duration: 1000 }
        Button {
            x: 10
            y: 100
            width: 60
            height: 20
            text: "Growing"
            Popover { id: growingPop; width: 100; height: 100; gap: 4; margins: 8 }
        }
    }

    // Under an ancestor scaled to nothing, with its gap and with none: no
    // point of the button's is anywhere but where it is all shrunk to, so
    // each keeps its button's corner.
    Item {
        x: 100
        y: 100
        width: 200
        height: 200
        scale: 0
        Button {
            width: 60
            height: 20
            text: "Gapped"
            Popover { id: gappedPop; width: 100; height: 100; gap: 4 }
        }
        Button {
            width: 60
            height: 20
            text: "Gapless"
            Popover { id: gaplessPop; width: 100; height: 100; gap: 0 }
        }
    }

    function grow() {
        grower.start()
        growingPop.open()
    }

    // The scale the growing ancestor reads, with where its popover is.
    function growth() {
        return [growing.scale].concat(at(growingPop))
    }

    // The scaled popover's surface, as it is drawn.
    function surface() {
        return scaledPop.background
    }

    // Its side, where it is in its button's terms, and where that is in the
    // window's.
    function at(pop) {
        const p = pop.parent.mapToItem(root, pop.x, pop.y)
        return [pop.side, pop.x, pop.y, p.x, p.y]
    }

    function popovers() {
        return { scaled: at(scaledPop), margins: at(marginPop), roomy: at(roomyPop), before: at(beforePop), moved: at(movedPop), gapped: [gappedPop.visible, gappedPop.x, gappedPop.y], gapless: [gaplessPop.visible, gaplessPop.x, gaplessPop.y] }
    }

    function popover(name) {
        return { scaled: scaledPop, margins: marginPop, roomy: roomyPop, before: beforePop, moved: movedPop, gapped: gappedPop, gapless: gaplessPop }[name]
    }
}
