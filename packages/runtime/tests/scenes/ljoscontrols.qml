// Ljós's own controls (`import Ljos.Controls`, `Ljos.Controls.Basic`), from
// `controls/`: what each answers is what Ljós's native engine answers for the
// same QML (ljos-ui's features/controls/ljos-style-labels.feature and
// ljos-style-groups.feature at the commit the controls are copied from).
// Popovers are ljospopovers.qml's, in a window of their own size.
import QtQuick
import QtQuick.Controls.impl
import QtQuick.Templates as T
import Ljos.Controls
import Ljos.Controls.Basic as LB

Item {
    id: root
    width: 600
    height: 600

    // The icon a button or a row is given, or its action's.
    Button { id: bare; icon.source: "../assets/circle.png" }
    Button { id: acting; x: 40; action: T.Action { icon.source: "../assets/circle.png" } }
    Button { id: tinted; x: 80; icon.source: "../assets/circle.png"; icon.color: "#0066cc" }
    Button { id: named; x: 120; iconName: "plus"; icon.source: "../assets/circle.png" }
    Button { id: plain; x: 160; text: "Save" }
    Button { id: pictured; x: 240; text: "Save"; icon.source: "../assets/circle.png" }
    MenuItem { id: row; y: 40; width: 200; text: "Open"; icon.source: "../assets/circle.png" }
    MenuItem { id: actingRow; x: 200; y: 40; width: 200; action: T.Action { text: "Save"; icon.source: "../assets/circle.png" } }
    MenuItem { id: plainRow; x: 400; y: 40; width: 200; text: "Quit" }

    // What `display` lets a button show.
    Button { id: beside; y: 80; text: "Save"; iconName: "plus" }
    Button { id: iconOnly; x: 100; y: 80; text: "Save"; iconName: "plus"; display: IconLabel.IconOnly }
    Button { id: textOnly; x: 200; y: 80; text: "Save"; iconName: "plus"; display: IconLabel.TextOnly }
    Button { id: under; x: 300; y: 80; text: "Save"; iconName: "plus"; display: IconLabel.TextUnderIcon }
    Button { id: pictureTextOnly; x: 400; y: 80; text: "Save"; icon.source: "../assets/circle.png"; display: IconLabel.TextOnly }

    // An empty state narrower than its text, and one as wide as its text.
    readonly property string longTitle: "A title that is a good deal wider than two hundred pixels"
    readonly property string longDescription: "A description that is a good deal wider than two hundred pixels, and wraps"
    EmptyState { id: narrow; y: 140; width: 200; title: root.longTitle; description: root.longDescription }
    EmptyState { id: natural; x: 220; y: 140; title: root.longTitle; description: root.longDescription }
    LB.EmptyState { id: basicNarrow; y: 260; width: 200; title: root.longTitle; description: root.longDescription }
    LB.EmptyState { id: basicNatural; x: 220; y: 260; title: root.longTitle; description: root.longDescription }

    // Mirrored by what they are in, by themselves, and not at all.
    Item {
        y: 380
        width: 600
        height: 60
        LayoutMirroring.enabled: true
        LayoutMirroring.childrenInherit: true
        EmptyState { id: inheritedEmpty; actionText: "New"; secondaryActionText: "Import" }
        LB.EmptyState { id: inheritedBasicEmpty; x: 150; actionText: "New"; secondaryActionText: "Import" }
        LB.SplitButton { id: inheritedSplit; x: 300; text: "Run" }
        TabButton { id: inheritedTab; x: 450; text: "Files"; iconName: "folder" }
    }
    Item {
        y: 440
        width: 600
        height: 60
        EmptyState { id: ownEmpty; LayoutMirroring.enabled: true; actionText: "New"; secondaryActionText: "Import" }
        LB.EmptyState { id: ownBasicEmpty; x: 150; LayoutMirroring.enabled: true; actionText: "New"; secondaryActionText: "Import" }
        LB.SplitButton { id: ownSplit; x: 300; LayoutMirroring.enabled: true; text: "Run" }
        TabButton { id: ownTab; x: 450; LayoutMirroring.enabled: true; text: "Files"; iconName: "folder" }
    }
    Item {
        y: 500
        width: 600
        height: 60
        EmptyState { id: plainEmpty; actionText: "New"; secondaryActionText: "Import" }
        LB.EmptyState { id: plainBasicEmpty; x: 150; actionText: "New"; secondaryActionText: "Import" }
        LB.SplitButton { id: plainSplit; x: 300; text: "Run" }
        TabButton { id: plainTab; x: 450; text: "Files"; iconName: "folder" }
    }

    function part(item, name) {
        if (!item) return null
        for (const child of item.children) {
            if (child.objectName === name) return child
            const found = part(child, name)
            if (found) return found
        }
        return null
    }

    function shown(control, name) {
        const item = part(control.contentItem, name)
        return item ? item.visible : null
    }

    // The colour a part's picture is drawn in.
    function ink(control, name) {
        const image = part(part(control.contentItem, name), "image")
        return image ? String(image.color) : null
    }

    // Whether every picture a button or a row shows has loaded: its size,
    // and so the room kept for it, comes of the file.
    function loaded() {
        return [bare, acting, tinted, pictured, row, actingRow].every((control) => {
            const image = part(part(control.contentItem, "picture"), "image")
            return image !== null && image.status === Image.Ready
        })
    }

    function icons() {
        return {
            bare: [bare.implicitContentWidth, shown(bare, "picture"), ink(bare, "picture"), String(bare.ink)],
            acting: [acting.implicitContentWidth, shown(acting, "picture")],
            tinted: [tinted.implicitContentWidth, ink(tinted, "picture")],
            named: [named.implicitContentWidth, shown(named, "glyph"), shown(named, "picture")],
            roomForIcon: pictured.implicitContentWidth - plain.implicitContentWidth,
            row: [shown(row, "picture"), row.contentItem.gutter],
            actingRow: [shown(actingRow, "picture"), actingRow.contentItem.gutter],
            plainRow: [shown(plainRow, "picture"), plainRow.contentItem.gutter],
        }
    }

    function displays() {
        const label = (control) => part(control.contentItem, "label")
        const glyph = (control) => part(control.contentItem, "glyph")
        return {
            besideWidth: beside.implicitContentWidth,
            labelWidth: label(plain).implicitWidth,
            iconOnly: [iconOnly.implicitContentWidth, glyph(iconOnly).visible, label(iconOnly).visible],
            textOnly: [textOnly.implicitContentWidth, glyph(textOnly).visible, label(textOnly).visible],
            pictureTextOnly: [pictureTextOnly.implicitContentWidth, shown(pictureTextOnly, "picture")],
            // Under: the mark is over the text, both in the middle.
            under: [under.implicitContentWidth, under.implicitContentHeight,
                    glyph(under).y + glyph(under).height <= label(under).y,
                    Math.round(glyph(under).x + glyph(under).width / 2),
                    Math.round(label(under).x + label(under).width / 2),
                    Math.round(under.contentItem.width / 2),
                    glyph(under).height + under.spacing + label(under).implicitHeight],
        }
    }

    function texts() {
        const widths = (control) => [part(control.contentItem, "title").width,
                                     part(control.contentItem, "description").width,
                                     control.availableWidth, control.implicitWidth]
        return { narrow: widths(narrow), natural: widths(natural),
                 basicNarrow: widths(basicNarrow), basicNatural: widths(basicNatural) }
    }

    // Whether the action is laid out before the secondary one, in the
    // window's terms: true is right to left.
    function mirrors() {
        const order = (control, first, second) => {
            const a = part(control.contentItem, first)
            const b = part(control.contentItem, second)
            return a.mapToItem(root, 0, 0).x < b.mapToItem(root, 0, 0).x
        }
        const empty = (control) => order(control, "action", "secondaryAction")
        const split = (control) => order(control, "more", "action")
        const tab = (control) => order(control, "label", "glyph")
        return {
            inherited: [empty(inheritedEmpty), empty(inheritedBasicEmpty), split(inheritedSplit), tab(inheritedTab)],
            own: [empty(ownEmpty), empty(ownBasicEmpty), split(ownSplit), tab(ownTab)],
            plain: [empty(plainEmpty), empty(plainBasicEmpty), split(plainSplit), tab(plainTab)],
            // The buttons in a mirrored row are mirrored themselves.
            buttons: [part(inheritedEmpty.contentItem, "action").mirrored, part(ownEmpty.contentItem, "action").mirrored],
        }
    }
}
