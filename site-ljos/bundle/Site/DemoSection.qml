import QtQuick
import Site

// A demo's place on the demos page: its name, what it shows, and the
// demo itself, which the section's one child is.
Column {
    id: section

    property string title: ""
    property string body: ""
    property bool wide: true
    default property alias content: holder.data

    spacing: Theme.m

    // Each demo opens on a hairline across the page, its heading a step
    // under the page's own, so the page reads as a set of chapters.
    Rectangle {
        width: parent.width
        height: 1
        color: Theme.divider
        Accessible.ignored: true
    }
    Item {
        width: 1
        height: section.wide ? Theme.m : Theme.xs
    }
    Heading {
        width: parent.width
        level: "headline"
        wide: section.wide
        headingLevel: 2
        text: section.title
    }
    Text {
        width: Math.min(parent.width, Theme.measure)
        text: section.body
        textFormat: Text.RichText
        color: Theme.textMuted
        linkColor: Theme.link
        font.family: Theme.sans
        font.pixelSize: Theme.bodySize
        lineHeightMode: Text.FixedHeight
        lineHeight: Theme.bodyLine
        wrapMode: Text.Wrap
    }
    Item {
        width: 1
        height: Theme.xs
    }
    Column {
        id: holder
        width: parent.width
    }
}
