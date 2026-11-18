// A button whose action's icon is given whole as the button's own: the
// button follows its action for every icon member it was not told (all but
// its picture here), and the action takes all of them from the button.
// Nobody gave a colour, so the picture is drawn in the colour of the
// button's text, and asking whether it was given one ends.
import QtQuick
import QtQuick.Controls.Basic

Item {
    width: 200
    height: 100

    Button { id: circular; text: "circle"; icon.source: "../assets/circle.png"; action: Action { icon: circular.icon } }

    function image(item) {
        if (!item) return null
        if (item.objectName === "image") return item
        for (const child of item.children) {
            const found = image(child)
            if (found) return found
        }
        return null
    }

    function colors() {
        return [String(image(circular.contentItem)?.color), String(circular.contentItem.color)]
    }
}
