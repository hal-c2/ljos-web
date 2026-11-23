import QtQuick
import Site
import Ljos.Core

// On this page: the headings of the docs page being read, each a link
// that lands on it without leaving the page. Beside the page where there
// is room, and in a phone's menu (`roomy`: the larger words and rows a
// finger needs).
Column {
    id: toc

    property var router: null
    property bool roomy: false
    // False where it is hidden: the build writes the page wide and
    // narrow, and would write every heading into both.
    property bool listed: true
    readonly property var headings: router && listed ? router.headings : []

    visible: headings.length > 0
    spacing: toc.roomy ? 0 : Theme.xs
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

        NavLink {
            required property var modelData

            x: modelData.level > 2 ? (toc.roomy ? Theme.m : Theme.s) : 0
            width: toc.width - x
            label: modelData.plain
            // The heading's own address, so it can be kept or opened
            // apart; a press lands on it in place.
            to: toc.router ? toc.router.route + "#" + modelData.anchor : "/"
            router: toc.router
            muted: true
            size: toc.roomy ? Theme.bodySize : Theme.captionSize + 1
            line: toc.roomy ? Theme.bodyLine : Theme.captionLine
            least: toc.roomy ? Theme.rowLeast : 0
        }
    }
}
