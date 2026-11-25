import QtQuick

// Two canvases of four pixels, red on the left and blue on the right, drawn
// ten times their size: one smoothed, as an item is unless it says, and one
// not, as pixel art asks.
Item {
    id: root
    property alias sharp: sharp
    width: 400; height: 300

    component Halves: Canvas {
        width: 4; height: 4
        transformOrigin: Item.TopLeft
        scale: 10
        onPaint: {
            const ctx = getContext("2d");
            ctx.fillStyle = "#ff0000";
            ctx.fillRect(0, 0, 2, 4);
            ctx.fillStyle = "#0000ff";
            ctx.fillRect(2, 0, 2, 4);
        }
    }

    Halves { id: soft; x: 20; y: 20 }
    Halves { id: sharp; x: 120; y: 20; smooth: false }
}
