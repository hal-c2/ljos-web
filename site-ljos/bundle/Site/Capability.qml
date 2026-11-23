// Ljós's Core before QtQuick: only its t`` is wanted here.
import Ljos.Core
import QtQuick
import Site
import "../nav.js" as Nav

// One thing Ljós does, said and shown: a short label, a headline, the
// words, and beside them the example that proves it. On a wide page the
// words take five of the grid's twelve columns and the example seven,
// and `flip` swaps the sides, so a page of them reads left, right, left;
// on a phone the example stands under the words. A region named by its
// headline; the example a group named "Example".
Item {
    id: capability

    property string eyebrow: ""
    property string title: ""
    property string body: ""
    property bool flip: false
    property bool wide: true
    // The example, and anything that follows the words (code, a link).
    default property alias example: exampleArea.data
    property alias after: afterArea.data
    readonly property real column: (width - (Theme.columns - 1) * Theme.columnGap) / Theme.columns
    readonly property int wordsWidth: wide ? Math.round(5 * column + 4 * Theme.columnGap) : width
    readonly property int exampleWidth: wide ? Math.round(7 * column + 6 * Theme.columnGap) : width
    signal followed(string link)

    width: parent ? parent.width : 1280
    height: wide ? Math.max(words.implicitHeight, exampleArea.implicitHeight) : words.implicitHeight + Theme.l + exampleArea.implicitHeight
    Accessible.role: Accessible.Section
    Accessible.name: title

    Column {
        id: words
        x: capability.wide && capability.flip ? capability.width - width : 0
        width: capability.wordsWidth
        spacing: Theme.m

        Text {
            visible: capability.eyebrow !== ""
            width: parent.width
            text: capability.eyebrow
            color: Theme.accent2Text
            font.family: Theme.sans
            font.pixelSize: Theme.captionSize
            font.weight: Font.DemiBold
            font.letterSpacing: 1.2
            font.capitalization: Font.AllUppercase
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.captionLine
        }
        Heading {
            width: parent.width
            level: "display"
            wide: capability.wide
            text: capability.title
        }
        Text {
            visible: capability.body !== ""
            width: parent.width
            textFormat: Text.RichText
            text: Nav.linked(Content.base, capability.body)
            color: Theme.textMuted
            linkColor: Theme.link
            font.family: Theme.sans
            font.pixelSize: Theme.bodySize
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.bodyLine
            wrapMode: Text.Wrap
            onLinkActivated: (link) => capability.followed(link)
        }
        Column {
            id: afterArea
            width: parent.width
            spacing: Theme.m
            topPadding: Theme.xs
        }
    }
    Column {
        id: exampleArea
        x: !capability.wide ? 0 : capability.flip ? 0 : capability.width - width
        y: capability.wide ? 0 : words.implicitHeight + Theme.l
        width: capability.exampleWidth
        spacing: Theme.s
        Accessible.role: Accessible.Grouping
        Accessible.name: t`Example`
    }
}
