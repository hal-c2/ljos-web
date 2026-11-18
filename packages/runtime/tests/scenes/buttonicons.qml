// The colour a Qt-style button's icon is drawn in. Ljós's Basic style writes
// no `icon: control.icon`, so its IconLabel takes the icon of the button it is
// in, as Ljós's native engine does (ljos-ui's crates/ljos_controls/src/icon_label.rs):
// in the colour the button was given, the picture as it is when that colour is
// "transparent", and in the colour of its text when it was given none.
import QtQuick
import QtQuick.Controls.Basic

Item {
    id: root
    width: 400
    height: 100

    Button { id: tinted; icon.source: "../assets/circle.png"; icon.color: "#0066cc" }
    Button { id: asItIs; x: 60; icon.source: "../assets/circle.png"; icon.color: "transparent" }
    Button { id: untold; x: 120; icon.source: "../assets/circle.png" }
    Button { id: acting; x: 180; action: Action { icon.source: "../assets/circle.png"; icon.color: "transparent" } }

    function image(control) {
        const find = (item) => {
            if (!item) return null
            if (item.objectName === "image") return item
            for (const child of item.children) {
                const found = find(child)
                if (found) return found
            }
            return null
        }
        return find(control.contentItem)
    }

    function loaded() {
        return [tinted, asItIs, untold, acting].every((control) => image(control)?.status === Image.Ready)
    }

    function colors() {
        return {
            tinted: String(image(tinted).color),
            asItIs: String(image(asItIs).color),
            untold: [String(image(untold).color), String(untold.contentItem.color)],
            acting: String(image(acting).color),
        }
    }
}
