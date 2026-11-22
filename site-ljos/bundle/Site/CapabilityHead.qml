// Ljós's Core before QtQuick: only its t`` is wanted here.
import Ljos.Core
import QtQuick
import Site
import "../nav.js" as Nav

// The head of one of the front page's capability sections: its name,
// the claim as a heading a screen reader can jump to, and the body
// that backs it.
Column {
    id: head

    property string eyebrow: ""
    property string headline: ""
    property string body: ""
    property bool wide: true
    // The measure the body reads at.
    property int prose: Math.min(width, Theme.measure)

    signal followed(string link)

    spacing: Theme.m

    Text {
        text: head.eyebrow
        color: Theme.link
        font.family: Theme.sans
        font.pixelSize: Theme.captionSize + 1
        font.weight: Font.DemiBold
        font.letterSpacing: 0.5
        lineHeightMode: Text.FixedHeight
        lineHeight: Theme.captionLine
    }
    Text {
        width: Math.min(head.width, 800)
        text: head.headline
        color: Theme.text
        font.family: Theme.serif
        font.pixelSize: head.wide ? Theme.headlineSize + 6 : Theme.headlineSize - 2
        font.weight: Font.Bold
        font.letterSpacing: head.wide ? -0.5 : 0
        lineHeightMode: Text.FixedHeight
        lineHeight: head.wide ? Theme.headlineLine + 6 : Theme.headlineLine - 4
        wrapMode: Text.Wrap
        readonly property int headingLevel: 2
        Accessible.role: Accessible.Heading
    }
    Text {
        visible: head.body !== ""
        width: head.prose
        textFormat: Text.RichText
        color: Theme.textMuted
        linkColor: Theme.link
        font.family: Theme.sans
        font.pixelSize: Theme.bodySize + 1
        lineHeightMode: Text.FixedHeight
        lineHeight: Theme.bodyLine + 4
        wrapMode: Text.Wrap
        text: Nav.linked(Content.base, head.body)
        onLinkActivated: (link) => head.followed(link)
    }
}
