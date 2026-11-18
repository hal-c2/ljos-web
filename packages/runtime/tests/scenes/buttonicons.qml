// The colour a Qt-style button's icon is drawn in. Ljós's Basic style writes
// no `icon: control.icon`, so its IconLabel takes the icon of the button it is
// in, as Ljós's native engine does (ljos-ui's crates/ljos_controls/src/icon_label.rs):
// in the colour the button was given, the picture as it is when that colour is
// "transparent", and in the colour of its text when it was given none.
import QtQuick
import QtQuick.Controls.Basic
import QtQuick.Controls.impl

Item {
    id: root
    width: 500
    height: 100

    Button { id: tinted; icon.source: "../assets/circle.png"; icon.color: "#0066cc" }
    Button { id: asItIs; x: 60; icon.source: "../assets/circle.png"; icon.color: "transparent" }
    Button { id: untold; x: 120; icon.source: "../assets/circle.png" }
    Button { id: acting; x: 180; action: Action { icon.source: "../assets/circle.png"; icon.color: "transparent" } }
    // An icon that is another button's, whose action gave it its colour.
    Button { id: giver; x: 240; action: Action { icon.source: "../assets/circle.png"; icon.color: "#0066cc" } }
    Button { id: linked; x: 300; icon: giver.icon }
    // An action whose icon is given whole, as one value.
    Button { id: wholeAction; x: 360; action: Action { icon: ({ source: "../assets/circle.png", color: "#0066cc" }) } }
    // An icon that is another button's, which was given no colour, in a
    // button whose action was given one: the icon given whole gives every
    // member, so the colour is none, and the action's is not asked.
    Button { id: bare; x: 420; icon.source: "../assets/circle.png" }
    Button { id: linkedActing; x: 420; y: 50; icon: bare.icon; action: Action { icon.color: "#0066cc" } }
    // The same, with the action's icon given back as the button's own.
    Button { id: linkedBack; x: 360; y: 50; icon: bare.icon; action: Action { icon: linkedBack.icon } }
    // A label given its icon whole, in a button that has none.
    Button { id: holder; y: 50; contentItem: IconLabel { icon: ({ source: "../assets/circle.png" }) } }
    // The picture as it is, to compare what is drawn with.
    Image { id: plain; x: 300; y: 60; width: 24; height: 24; source: "../assets/circle.png" }

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
        return plain.status === Image.Ready
            && [tinted, asItIs, untold, acting, linked, wholeAction, linkedActing, linkedBack].every((control) => image(control)?.status === Image.Ready)
    }

    function colors() {
        return {
            tinted: String(image(tinted).color),
            asItIs: String(image(asItIs).color),
            untold: [String(image(untold).color), String(untold.contentItem.color)],
            acting: String(image(acting).color),
            linked: String(image(linked).color),
            wholeAction: String(image(wholeAction).color),
            holder: String(image(holder)?.source ?? ""),
            linkedActing: [String(image(linkedActing).color), String(linkedActing.contentItem.color)],
            linkedBack: [String(image(linkedBack).color), String(linkedBack.contentItem.color)],
        }
    }

    // Where the middle of each picture is drawn in the scene.
    function middles() {
        const middle = (item) => {
            const point = item.mapToItem(root, item.width / 2, item.height / 2)
            return [Math.round(point.x), Math.round(point.y)]
        }
        return { tinted: middle(image(tinted)), asItIs: middle(image(asItIs)), plain: middle(plain) }
    }
}
