// Ljós's Core before QtQuick: only its t`` is wanted here.
import Ljos.Core
import QtQuick
import Site
import "../nav.js" as Nav

// One thing Ljós does, said and shown: a short label, a headline, the
// words, and beside them the example that proves it. On a wide page the
// words take five of the grid's twelve columns and the example seven,
// and `flip` swaps the sides, so a page of them reads left, right, left;
// on a phone the example stands under the words, and so does one that
// is `stacked`, as wide as the page. A region named by its headline; the
// example a group named "Example".
Item {
    id: capability

    property string eyebrow: ""
    property string title: ""
    property string body: ""
    property bool flip: false
    property bool wide: true
    // The example stands under the words on a wide page too, as wide as
    // the page: a live app shown as a console wants all of it.
    property bool stacked: false
    // The example, and anything that follows the words (code, a link).
    default property alias example: exampleArea.data
    property alias after: afterArea.data
    readonly property real column: (width - (Theme.columns - 1) * Theme.columnGap) / Theme.columns
    // The words and the example side by side, or one over the other.
    readonly property bool across: wide && !stacked
    readonly property int wordsWidth: across ? Math.round(5 * column + 4 * Theme.columnGap) : wide ? Math.round(9 * column + 8 * Theme.columnGap) : width
    readonly property int exampleWidth: across ? Math.round(7 * column + 6 * Theme.columnGap) : width
    signal followed(string link)

    width: parent ? parent.width : 1280
    height: across ? Math.max(words.implicitHeight, exampleArea.implicitHeight) : words.implicitHeight + Theme.l + exampleArea.implicitHeight
    Accessible.role: Accessible.Section
    Accessible.name: title

    Column {
        id: words
        x: capability.across && capability.flip ? capability.width - width : 0
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
        x: !capability.across ? 0 : capability.flip ? 0 : capability.width - width
        y: capability.across ? 0 : words.implicitHeight + Theme.l
        width: capability.exampleWidth
        spacing: Theme.s
        Accessible.role: Accessible.Grouping
        Accessible.name: t`Example`
    }
}
