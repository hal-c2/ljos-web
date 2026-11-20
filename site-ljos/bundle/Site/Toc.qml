import QtQuick
import Site
import Ljos.Core
import "../nav.js" as Nav

// On this page: the headings of the docs page being read, each a link
// that lands on it without leaving the page. Beside the page where there
// is room, and in a phone's menu (`roomy`: the larger words a finger
// needs).
Column {
    id: toc

    property var router: null
    property bool roomy: false
    readonly property var headings: router ? router.headings : []

    visible: headings.length > 0
    spacing: Theme.xs
    Accessible.role: Accessible.Section
    Accessible.name: t`On this page`

    Text {
        text: t`On this page`
        color: Theme.textMuted
        font.family: Theme.sans
        font.pixelSize: Theme.captionSize
        font.weight: Font.DemiBold
        lineHeightMode: Text.FixedHeight
        lineHeight: Theme.captionLine
        Accessible.ignored: true
    }
    Repeater {
        model: toc.headings

        Text {
            required property var modelData
            // The heading's own address, so it can be kept or opened
            // apart; a press lands on it in place.
            property string href: Nav.at(Content.base, toc.router.route) + "#" + modelData.anchor

            x: modelData.level > 2 ? (toc.roomy ? Theme.m : Theme.s) : 0
            width: toc.width - x
            textFormat: Text.RichText
            text: Nav.anchor("#" + modelData.anchor, modelData.plain, hoveredLink !== "")
            color: Theme.textMuted
            linkColor: Theme.textMuted
            font.family: Theme.sans
            font.pixelSize: toc.roomy ? Theme.bodySize : Theme.captionSize + 1
            lineHeightMode: Text.FixedHeight
            lineHeight: toc.roomy ? Theme.bodyLine : Theme.captionLine
            wrapMode: Text.Wrap
            onLinkActivated: (to) => toc.router.follow("#" + modelData.anchor)
        }
    }
}
