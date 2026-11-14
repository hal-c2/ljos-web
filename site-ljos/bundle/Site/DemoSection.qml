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

    spacing: Theme.s

    Text {
        width: parent.width
        text: section.title
        color: Theme.text
        font.family: Theme.sans
        font.pixelSize: section.wide ? Theme.titleSize + 1 : Theme.titleSize - 1
        font.weight: Font.Bold
        lineHeightMode: Text.FixedHeight
        lineHeight: Theme.titleLine + 4
        wrapMode: Text.Wrap
        Accessible.role: Accessible.Heading
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
        height: Theme.xxs
    }
    Column {
        id: holder
        width: parent.width
    }
}
