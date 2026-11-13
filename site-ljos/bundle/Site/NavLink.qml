import QtQuick
import Site
import "../nav.js" as Nav

// One link of the shell: a real link to the page it names (a reader
// can open it in a new tab, a crawler follows it, Tab reaches it), a
// full navigation away. The page the reader is on is the strong one.
Text {
    id: link

    property string label: ""
    property string href: "/"
    property bool current: false
    property int size: Theme.bodySize
    property int line: Theme.bodyLine
    property bool muted: false

    textFormat: Text.RichText
    text: Nav.anchor(href, label, hoveredLink !== "")
    color: current ? Theme.link : muted ? Theme.textMuted : Theme.text
    linkColor: color
    font.family: Theme.sans
    font.pixelSize: size
    font.weight: current ? Font.DemiBold : Font.Normal
    lineHeightMode: Text.FixedHeight
    lineHeight: line
    wrapMode: Text.Wrap
    onLinkActivated: (to) => Nav.go(to)
}
