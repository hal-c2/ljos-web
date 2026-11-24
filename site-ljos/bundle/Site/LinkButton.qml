import QtQuick
import Site
import "../nav.js" as Nav

// A link drawn as a button: a call to action. Its words are a real
// link in the page's HTML — a crawler, a reader with no script and the
// browser's own Tab all find it — and the whole button takes a press.
Rectangle {
    id: button

    property string label: ""
    property string href: ""
    // Filled with the accent, or a ghost: a hairline on the page's ground.
    property bool primary: false
    // A lesser call beside the first: its words alone, in the link's colour.
    property bool quiet: false

    implicitWidth: words.implicitWidth + 2 * (quiet ? Theme.m : Theme.l)
    implicitHeight: 48
    radius: Theme.brackets ? Theme.radiusSmall : Math.min(Theme.radius, height / 2)
    color: primary ? (area.pressed ? Theme.accentPressed : area.containsMouse ? Theme.accentHover : Theme.accent) : (area.pressed ? Theme.surfacePressed : area.containsMouse ? Theme.surfaceHover : "transparent")
    border.color: primary || quiet ? "transparent" : Theme.border
    border.width: primary || quiet ? 0 : 1

    Behavior on color {
        ColorAnimation {
            duration: Theme.moveSmall
        }
    }

    MouseArea {
        id: area
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        Accessible.ignored: true
        onClicked: Nav.go(Nav.at(Content.base, button.href))
    }
    Text {
        id: words
        // A quiet link that wraps to the start of a row keeps its words
        // on the edge the text above starts from, not a padding in from
        // it; beside another button its padding is the gap between them.
        // Where it starts, read from the left; a right-to-left page
        // sets it as far from the right (LayoutMirroring).
        readonly property real startX: button.quiet && button.x === 0 ? 0 : Math.round((parent.width - width) / 2)
        x: LayoutMirroring.enabled ? parent.width - width - startX : startX
        anchors.verticalCenter: parent.verticalCenter
        textFormat: Text.RichText
        text: Nav.anchor(Nav.at(Content.base, button.href), button.label, false, color)
        color: button.primary ? Theme.textOnAccent : button.quiet ? Theme.link : Theme.text
        linkColor: color
        font.family: Theme.sans
        font.pixelSize: Theme.bodySize - 1
        font.weight: Font.DemiBold
        lineHeightMode: Text.FixedHeight
        lineHeight: Theme.bodyLine
        onLinkActivated: (to) => Nav.go(to)
    }
}
