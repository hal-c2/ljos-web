import QtQuick
import QtQuick.Controls.impl
import QtQuick.Templates as T

// Qt 6.12's styles draw a menu item's icon and text with a
// MenuItemIconLabel: an IconLabel that is told which item it is in. Next to
// an IconLabel given the same, it measures, places and colours alike, given
// an item or not, until the item's action has a shortcut: then the label
// shows it too, at its far side, when there is room for it. The font is one of boxes, so that Qt and a browser
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

    // Items whose action has a shortcut, and one whose action has none.
    T.MenuItem { id: keyed; visible: false; action: T.Action { text: "Hello"; shortcut: "Ctrl+S" } }
    T.MenuItem { id: lower; visible: false; action: T.Action { text: "Hello"; shortcut: "ctrl+shift+q" } }
    T.MenuItem { id: chords; visible: false; action: T.Action { text: "Hello"; shortcut: "Ctrl+E,Ctrl+W" } }
    T.MenuItem { id: spacedChords; visible: false; action: T.Action { text: "Hello"; shortcut: "ctrl+k, ctrl+c" } }
    T.MenuItem { id: plusChords; visible: false; action: T.Action { text: "Hello"; shortcut: "Ctrl++,Ctrl+W" } }
    T.MenuItem { id: unread; visible: false; action: T.Action { text: "Hello"; shortcut: "Ctrl+Nope" } }
    T.MenuItem { id: unkeyed; visible: false; action: T.Action { text: "Hello" } }

    // Told their item once the font is there: Qt makes the shortcut's text
    // when it is told, in the font the label has then.
    Boxed { id: keyBeside; text: "Hello"; icon.source: "../assets/flag.png"; spacing: 6 }
    Boxed { id: keyText; text: "Hello"; spacing: 6; display: MenuItemIconLabel.TextOnly }
    Boxed { id: keyUnder; text: "Hello"; icon.source: "../assets/flag.png"; spacing: 6; display: MenuItemIconLabel.TextUnderIcon }
    Boxed { id: keyIcon; text: "Hello"; icon.source: "../assets/flag.png"; spacing: 6; display: MenuItemIconLabel.IconOnly }
    Boxed { id: keyFits; width: 140; height: 20; text: "Hello"; icon.source: "../assets/flag.png"; spacing: 6 }
    Boxed { id: keyTight; width: 139; height: 20; text: "Hello"; icon.source: "../assets/flag.png"; spacing: 6 }
    Boxed { id: keyPadded; width: 200; height: 40; leftPadding: 5; rightPadding: 7; topPadding: 3; text: "Hello"; icon.source: "../assets/flag.png"; spacing: 6; alignment: Qt.AlignLeft }
    Boxed { id: keyMirrored; width: 200; height: 40; mirrored: true; text: "Hello"; icon.source: "../assets/flag.png"; spacing: 6; alignment: Qt.AlignLeft }
    Boxed { id: keyRed; width: 200; height: 20; color: "#ff0000"; text: "Hello"; icon.source: "../assets/flag.png"; spacing: 6; alignment: Qt.AlignLeft }
    Boxed { id: keyLower; width: 200; height: 20; text: "Hello"; spacing: 6; display: MenuItemIconLabel.TextOnly }
    // By itself, the text keeps the spacing from the shortcut twice.
    Boxed { id: keyTextTight; width: 100; height: 20; text: "Hello"; spacing: 6; display: MenuItemIconLabel.TextOnly }
    Boxed { id: keyTextFits; width: 101; height: 20; text: "Hello"; spacing: 6; display: MenuItemIconLabel.TextOnly }
    Boxed { id: keyChords; width: 400; height: 20; text: "Hello"; icon.source: "../assets/flag.png"; spacing: 6 }
    Boxed { id: keySpacedChords; width: 400; height: 20; text: "Hello"; icon.source: "../assets/flag.png"; spacing: 6 }
    Boxed { id: keyPlusChords; width: 400; height: 20; text: "Hello"; icon.source: "../assets/flag.png"; spacing: 6 }
    Boxed { id: keyUnread; width: 400; height: 20; text: "Hello"; icon.source: "../assets/flag.png"; spacing: 6 }
    Boxed { id: keyNone; text: "Hello"; icon.source: "../assets/flag.png"; spacing: 6 }

    Plain { id: plainBoth; text: "Hello"; icon.source: "../assets/flag.png"; spacing: 6 }
    Plain { id: plainRoomy; width: 200; height: 40; text: "Hello"; icon.source: "../assets/flag.png"; spacing: 6; alignment: Qt.AlignLeft }

    readonly property var labels: [both, under, noIcon, roomy, mirrored, sized, coloured, uncoloured, tied, plainBoth, plainRoomy]
    readonly property var keyedLabels: [keyBeside, keyText, keyUnder, keyIcon, keyFits, keyTight, keyPadded, keyMirrored, keyRed]
    readonly property var laterLabels: [keyTextTight, keyTextFits, keyChords, keySpacedChords, keyUnread, keyPlusChords]

    function ready() {
        if (boxes.status !== FontLoader.Ready) return false
        for (const label of labels.concat(keyedLabels, [keyLower, keyNone], laterLabels)) {
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

    // The child that is neither the icon nor the text: the shortcut's.
    function shortcut(label) {
        for (const child of label.children)
            if (child.objectName !== "image" && child.objectName !== "label") return child
        return null
    }

    function keys(label) {
        const shown = shortcut(label)
        return measured(label).concat([shown ? box(shown).concat([shown.visible, shown.text, String(shown.color)]) : null])
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

        for (const label of keyedLabels) label.menuItem = keyed
        keyLower.menuItem = lower
        keyNone.menuItem = unkeyed
        for (const label of keyedLabels.concat([keyLower, keyNone])) rows.push(keys(label))
        // Told no item, it has no shortcut to show.
        keyBeside.menuItem = null
        keyFits.menuItem = null
        rows.push(keys(keyBeside))
        rows.push(keys(keyFits))

        keyTextTight.menuItem = keyed
        keyTextFits.menuItem = keyed
        keyChords.menuItem = chords
        keySpacedChords.menuItem = spacedChords
        keyUnread.menuItem = unread
        keyPlusChords.menuItem = plusChords
        for (const label of laterLabels) rows.push(keys(label))
        return rows
    }
}
