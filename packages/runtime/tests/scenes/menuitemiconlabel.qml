import QtQuick
import QtQuick.Controls.impl
import QtQuick.Templates as T

// Qt 6.12's styles draw a menu item's icon and text with a
// MenuItemIconLabel: an IconLabel that is told which item it is in. Next to
// an IconLabel given the same, it measures, places and colours alike, given
// an item or not. The font is one of boxes, so that Qt and a browser
// measure a text alike.
Item {
    id: root
    width: 400
    height: 300

    FontLoader { id: boxes; source: "../assets/boxes.ttf" }

    component Boxed: MenuItemIconLabel { font.family: boxes.name; font.pixelSize: 16 }
    component Plain: IconLabel { font.family: boxes.name; font.pixelSize: 16 }

    // The item a label is in. Being told it changes nothing the label shows.
    T.MenuItem { id: item; text: "Hello"; visible: false }

    Boxed { id: both; text: "Hello"; icon.source: "../assets/flag.png"; spacing: 6 }
    Boxed { id: under; text: "Hello"; icon.source: "../assets/flag.png"; spacing: 6; display: MenuItemIconLabel.TextUnderIcon }
    Boxed { id: noIcon; text: "Hello"; spacing: 6 }
    Boxed { id: roomy; width: 200; height: 40; text: "Hello"; icon.source: "../assets/flag.png"; spacing: 6; alignment: Qt.AlignLeft }
    Boxed { id: mirrored; width: 200; height: 40; text: "Hello"; icon.source: "../assets/flag.png"; spacing: 6; mirrored: true; alignment: Qt.AlignLeft }
    Boxed { id: sized; text: "Hello"; icon.source: "../assets/flag.png"; icon.width: 24; icon.height: 24; spacing: 6 }
    Boxed { id: coloured; icon.source: "../assets/flag.png"; icon.color: "#ff0000"; defaultIconColor: "#0000ff" }
    Boxed { id: uncoloured; icon.source: "../assets/flag.png"; defaultIconColor: "#0000ff" }
    Boxed { id: tied; text: "Hello"; icon.source: "../assets/flag.png"; spacing: 6; menuItem: null }

    Plain { id: plainBoth; text: "Hello"; icon.source: "../assets/flag.png"; spacing: 6 }
    Plain { id: plainRoomy; width: 200; height: 40; text: "Hello"; icon.source: "../assets/flag.png"; spacing: 6; alignment: Qt.AlignLeft }

    readonly property var labels: [both, under, noIcon, roomy, mirrored, sized, coloured, uncoloured, tied, plainBoth, plainRoomy]

    function ready() {
        if (boxes.status !== FontLoader.Ready) return false
        for (const label of labels) {
            for (const child of label.children)
                if (child.objectName === "image" && child.source != "" && child.status !== Image.Ready) return false
        }
        return true
    }

    function part(label, name) {
        for (const child of label.children)
            if (child.objectName === name) return child
        return null
    }

    function box(item) {
        return item ? [item.x, item.y, item.width, item.height] : null
    }

    function measured(label) {
        const image = part(label, "image")
        const text = part(label, "label")
        return [label.implicitWidth, label.implicitHeight, label.baselineOffset, label.children.length, box(image), box(text),
            text ? text.text : null, image ? String(image.color) : null]
    }

    function answers() {
        const rows = []
        for (const label of labels) rows.push(measured(label))
        rows.push([both.menuItem === null, both.display, both.alignment, String(both.defaultIconColor),
            MenuItemIconLabel.IconOnly, MenuItemIconLabel.TextOnly, MenuItemIconLabel.TextBesideIcon, MenuItemIconLabel.TextUnderIcon])
        let told = 0
        tied.menuItemChanged.connect(() => told++)
        tied.menuItem = item
        rows.push([tied.menuItem === item, told, measured(tied)])
        tied.menuItem = item
        tied.menuItem = null
        rows.push([tied.menuItem === null, told, measured(tied)])
        return rows
    }
}
