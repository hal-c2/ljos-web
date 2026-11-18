// What Ljós's own buttons, menu rows and tabs (`import Ljos.Controls`) show
// and ask for as what they are given changes: a picture that is still
// loading, a parent shown or hidden, their own content, their icon's size.
// What Ljós's native engine answers for the same QML (ljos-ui's
// features/controls/ljos-style-labels.feature at the commit `controls/` is
// copied from).
import QtQuick
import QtQuick.Controls.impl
import QtQuick.Templates as T
import Ljos.Controls

Item {
    id: root
    width: 600
    height: 400

    // Shown as their icon: their text shows while their next picture loads.
    Item {
        id: swapped
        Button { text: "Save"; icon.source: "../assets/circle.png"; display: IconLabel.IconOnly }
        TabButton { x: 100; text: "Files"; icon.source: "../assets/circle.png"; display: IconLabel.IconOnly }
        MenuItem { x: 200; width: 120; text: "Open"; icon.source: "../assets/circle.png"; display: IconLabel.IconOnly }
    }

    // Measured hidden and shown.
    property bool shown: false
    Item {
        y: 40
        visible: root.shown
        Button { id: large; iconSize: 64; iconName: "plus"; text: "Save"; display: IconLabel.IconOnly }
        Button { id: more; x: 80; iconName: "plus"; text: "Save"; chevron: true }
        Button { id: under; x: 200; iconName: "plus"; text: "Save"; display: IconLabel.TextUnderIcon }
        MenuItem { id: row; y: 80; iconName: "folder"; text: "Open"; shortcut: "Ctrl+O" }
        TabButton { id: tab; x: 280; y: 80; iconName: "folder"; text: "Files"; display: IconLabel.TextUnderIcon }
    }

    // A menu row's picture, its own or its action's, beside its text or alone.
    Item {
        id: pictured
        y: 200
        MenuItem { width: 120; text: "Open"; icon.source: "../assets/circle.png" }
        MenuItem { x: 120; width: 120; text: "Open"; icon.source: "../assets/circle.png"; display: IconLabel.IconOnly }
        MenuItem { x: 240; width: 120; action: T.Action { text: "Save"; icon.source: "../assets/circle.png" } }
        MenuItem { x: 360; width: 120; display: IconLabel.IconOnly; action: T.Action { text: "Save"; icon.source: "../assets/circle.png" } }
    }

    // Given their own content, which says whether it draws the icon over the
    // text.
    Button { id: ownOver; y: 260; text: "Save"; contentItem: Text { property bool iconOverText: true; text: "Save" } }
    Button { id: ownBeside; x: 100; y: 260; text: "Save"; display: IconLabel.TextUnderIcon
             contentItem: Text { property bool iconOverText: false; text: "Save" } }
    TabButton { id: tabOver; x: 200; y: 260; text: "Files"; contentItem: Text { property bool iconOverText: true; text: "Files" } }
    TabButton { id: tabBeside; x: 300; y: 260; text: "Files"; display: IconLabel.TextUnderIcon
                contentItem: Text { property bool iconOverText: false; text: "Files" } }

    // Given their icon's size, or not.
    TabButton { id: sized; y: 320; text: "Files"; icon.source: "../assets/circle.png"; icon.width: 16; icon.height: 16; display: IconLabel.IconOnly }
    TabButton { id: plainTab; x: 100; y: 320; text: "Files"; icon.source: "../assets/circle.png"; display: IconLabel.IconOnly }
    TabButton { id: narrow; x: 200; y: 320; text: "Files"; icon.source: "../assets/circle.png"; icon.width: 8; display: IconLabel.IconOnly }

    function part(item, name) {
        if (!item) return null
        for (const child of item.children) {
            if (child.objectName === name) return child
            const found = part(child, name)
            if (found) return found
        }
        return null
    }

    function loaded() {
        return [swapped, pictured].every((group) => Array.from(group.children).every((control) => {
            const image = part(part(control.contentItem, "picture"), "image")
            return image !== null && image.status === Image.Ready
        })) && [sized, plainTab, narrow].every((control) => part(part(control.contentItem, "picture"), "image").status === Image.Ready)
    }

    // Whether each swapped control shows its text.
    function texts() {
        return Array.from(swapped.children).map((control) => part(control.contentItem, "label").visible)
    }

    // A 16 by 16 blue picture, which loads later.
    function swap() {
        for (const control of swapped.children)
            control.icon.source = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFUlEQVR42mNgYPhPIhrVMKph2GoAAJLb/wHQPqPSAAAAAElFTkSuQmCC"
    }

    // What the hidden or shown controls ask for.
    function sizes() {
        return [large.implicitHeight, more.implicitWidth, under.implicitHeight, under.topPadding,
                row.implicitWidth, row.contentItem.gutter, tab.implicitHeight, tab.verticalPadding]
    }

    // Whether each row shows its picture, how large it was made, and whether
    // its text.
    function pictures() {
        return Array.from(pictured.children).map((control) => {
            const picture = part(control.contentItem, "picture")
            return [picture.visible, picture.implicitWidth, part(control.contentItem, "label").visible]
        })
    }

    function paddings() {
        return [ownOver.topPadding, ownOver.bottomPadding, ownBeside.topPadding, ownBeside.bottomPadding,
                tabOver.verticalPadding, tabBeside.verticalPadding]
    }

    function iconSizes() {
        return [sized.implicitContentWidth, sized.implicitContentHeight, plainTab.implicitContentWidth, narrow.implicitContentWidth]
    }
}
