// What Ljós's own buttons, menu rows and tabs (`import Ljos.Controls`) show
// for their display, and where: what Ljós's native engine answers for the
// same QML (ljos-ui's features/controls/ljos-style-labels.feature at the
// commit `controls/` is copied from).
import QtQuick
import QtQuick.Controls.impl
import QtQuick.Templates as T
import Ljos.Controls

Item {
    id: root
    width: 600
    height: 400

    Button { id: plain; text: "Save" }
    // A control with only one of its icon and its text shows it, whatever
    // its display says.
    Button { id: noIcon; x: 80; text: "Save"; display: IconLabel.IconOnly }
    Button { id: noText; x: 160; iconName: "plus"; display: IconLabel.TextOnly }

    // Wider than they ask for, with the icon alone.
    Button { id: wideGlyph; y: 40; width: 48; text: "Save"; iconName: "plus"; display: IconLabel.IconOnly }
    Button { id: widePicture; x: 60; y: 40; width: 48; text: "Save"; icon.source: "../assets/circle.png"; display: IconLabel.IconOnly }
    Button { id: wideMirrored; x: 120; y: 40; width: 48; text: "Save"; iconName: "plus"; display: IconLabel.IconOnly; LayoutMirroring.enabled: true }
    Button { id: wideEmpty; x: 180; y: 40; width: 48; text: ""; iconName: "plus" }
    // A picture smaller than the size it may be drawn at.
    Button { id: smallPicture; x: 240; y: 40; iconSize: 64; icon.source: "../assets/circle.png"; text: "Save"; display: IconLabel.IconOnly }
    Button { id: largeGlyph; x: 320; y: 40; iconSize: 64; iconName: "plus"; text: "Save"; display: IconLabel.IconOnly }

    MenuItem { id: rowNoIcon; y: 120; width: 120; text: "Open"; display: IconLabel.IconOnly }
    MenuItem { id: rowNoText; x: 120; y: 120; width: 120; iconName: "folder"; display: IconLabel.TextOnly }
    MenuItem { id: tallRow; x: 240; y: 120; width: 120; text: "Open"; iconName: "folder"; display: IconLabel.IconOnly; font.pixelSize: 80 }

    TabButton { id: tabTextOnly; y: 200; text: "Files"; iconName: "folder"; display: IconLabel.TextOnly }
    TabButton { id: tabPlain; x: 100; y: 200; text: "Files" }
    TabButton { id: tabNoIcon; x: 200; y: 200; text: "Files"; display: IconLabel.IconOnly }
    TabButton { id: tabNoText; x: 300; y: 200; iconName: "folder"; display: IconLabel.TextOnly }

    // Given the padding of one edge.
    Button { id: padded; x: 400; y: 40; topPadding: 12; text: "Save" }
    Button { id: paddedUnder; x: 480; y: 40; topPadding: 12; text: "Save"; iconName: "plus"; display: IconLabel.TextUnderIcon }

    // Given a picture they do not show, as a glyph wins over it or the
    // display hides it.
    Button { id: namedPicture; y: 320; text: "Save"; iconName: "plus"; icon.source: "../assets/circle.png" }
    Button { id: textOnlyPicture; x: 80; y: 320; text: "Save"; icon.source: "../assets/circle.png"; display: IconLabel.TextOnly }
    Button { id: textOnlyAction; x: 160; y: 320; display: IconLabel.TextOnly; action: T.Action { text: "Save"; icon.source: "../assets/circle.png" } }
    TabButton { id: textOnlyTab; x: 240; y: 320; text: "Files"; icon.source: "../assets/circle.png"; display: IconLabel.TextOnly }

    // A tab given a picture, by itself or its action, and shown as its icon.
    TabButton { id: tabPicture; x: 400; y: 200; text: "Files"; icon.source: "../assets/circle.png"; display: IconLabel.IconOnly }
    TabButton { id: tabAction; x: 480; y: 200; display: IconLabel.IconOnly; action: T.Action { text: "Files"; icon.source: "../assets/circle.png" } }
    TabButton { id: tabPictureChecked; x: 480; y: 260; checked: true; icon.source: "../assets/circle.png"; display: IconLabel.IconOnly }

    // A lone "&" is a mnemonic's marker and draws nothing: no text.
    Button { id: markerOnly; x: 400; y: 320; text: "&"; icon.source: "../assets/circle.png"; display: IconLabel.TextOnly }
    MenuItem { id: rowMarker; x: 360; y: 120; width: 120; text: "&"; iconName: "folder"; display: IconLabel.TextOnly }

    // Shown under their icon with only one of the two.
    TabButton { id: tabUnderText; y: 360; text: "Files"; display: IconLabel.TextUnderIcon }
    TabButton { id: tabUnderIcon; x: 100; y: 360; iconName: "folder"; display: IconLabel.TextUnderIcon }
    Button { id: underText; x: 200; y: 360; text: "Save"; display: IconLabel.TextUnderIcon }
    Button { id: underIcon; x: 280; y: 360; iconName: "plus"; display: IconLabel.TextUnderIcon }

    // A menu whose only icon is on a row shown as its text.
    Menu {
        id: hiding
        y: 260
        MenuItem { id: hidden; text: "Open"; iconName: "folder"; display: IconLabel.TextOnly }
        MenuItem { id: other; text: "Close" }
        MenuItem { id: kept; text: "Keep"; iconSpace: true }
    }
    Menu {
        id: alone
        x: 240
        y: 260
        MenuItem { iconName: "folder"; display: IconLabel.TextOnly }
        MenuItem { id: beside; text: "Close" }
    }
    Menu {
        id: marking
        x: 360
        y: 260
        MenuItem { text: "&"; iconName: "folder"; display: IconLabel.TextOnly }
        MenuItem { id: besideMarker; text: "Close" }
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

    // Whether it shows its icon, and its text.
    function shows(control) {
        const glyph = part(control.contentItem, "glyph")
        const picture = part(control.contentItem, "picture")
        return [(glyph !== null && glyph.visible) || (picture !== null && picture.visible), part(control.contentItem, "label").visible]
    }

    // The icon it shows.
    function mark(control) {
        const glyph = part(control.contentItem, "glyph")
        return glyph !== null && glyph.visible ? glyph : part(control.contentItem, "picture")
    }

    // How far the middle of what it shows is from its own.
    function offset(control, item) {
        return Math.round(item.mapToItem(control, 0, 0).x + item.width / 2 - control.width / 2)
    }

    function loaded() {
        return [widePicture, smallPicture].every((control) => {
            const image = part(part(control.contentItem, "picture"), "image")
            return image !== null && image.status === Image.Ready
        })
    }

    function buttons() {
        const text = part(plain.contentItem, "label").implicitWidth
        return {
            noIcon: [noIcon.implicitContentWidth - text, shows(noIcon)],
            noText: [noText.implicitContentWidth, shows(noText)],
            middles: [wideGlyph, widePicture, wideMirrored, wideEmpty].map((control) => offset(control, mark(control))),
            heights: [smallPicture.implicitContentHeight, largeGlyph.implicitContentHeight],
        }
    }

    function rows() {
        return {
            noIcon: [rowNoIcon.contentItem.gutter, shows(rowNoIcon)],
            noText: [rowNoText.contentItem.gutter, shows(rowNoText)],
            tallFits: tallRow.implicitHeight === Theme.controlHeight,
        }
    }

    function tabs() {
        const alone = (control) => {
            const glyph = part(control.contentItem, "glyph")
            const lone = glyph.visible ? glyph : part(control.contentItem, "label")
            return [shows(control), control.implicitContentWidth - lone.width, offset(control, lone)]
        }
        return { textOnly: alone(tabTextOnly), plain: alone(tabPlain), noIcon: alone(tabNoIcon), noText: alone(tabNoText) }
    }

    function paddings() {
        return [padded.bottomPadding, paddedUnder.bottomPadding]
    }

    // The source each hidden picture would load, and how large it was made:
    // a picture with no source may have no image at all.
    function hiddenPictures() {
        return [namedPicture, textOnlyPicture, textOnlyAction, textOnlyTab].map((control) => {
            const picture = part(control.contentItem, "picture")
            if (picture === null) return null
            const image = part(picture, "image")
            return [image === null ? "" : String(image.source), picture.visible, picture.implicitWidth]
        })
    }

    // Lets each show its picture.
    function showPictures() {
        namedPicture.iconName = ""
        textOnlyPicture.display = IconLabel.TextBesideIcon
        textOnlyAction.display = IconLabel.TextBesideIcon
        textOnlyTab.display = IconLabel.TextBesideIcon
    }

    // Whether each shows its picture, how large, and whether its text.
    function shownPictures() {
        return [namedPicture, textOnlyPicture, textOnlyAction, textOnlyTab, tabPicture, tabAction].map((control) => {
            const picture = part(control.contentItem, "picture")
            return picture === null ? null : [picture.visible, picture.width, part(control.contentItem, "label").visible]
        })
    }

    function menus() {
        hiding.open()
        alone.open()
        marking.open()
        return [hidden, other, kept, beside, besideMarker].map((row) => row.contentItem.gutter)
    }

    // What a button and a row whose text is a lone "&" show.
    function markers() {
        return {
            button: [shows(markerOnly), part(markerOnly.contentItem, "picture").implicitWidth],
            row: [rowMarker.contentItem.gutter, shows(rowMarker)],
        }
    }

    // The colour each tab's picture is drawn in, and the tab's ink.
    function tabInks() {
        return [tabPicture, tabPictureChecked].map((tab) => {
            const image = part(part(tab.contentItem, "picture"), "image")
            return [image ? String(image.color) : null, String(tab.ink)]
        })
    }

    function stackedPaddings() {
        return [tabUnderText.verticalPadding, tabUnderIcon.verticalPadding,
                underText.topPadding, underText.bottomPadding, underIcon.topPadding, underIcon.bottomPadding]
    }
}
