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
    // Filled with the accent, or outlined on the page's ground.
    property bool primary: false

    implicitWidth: words.implicitWidth + 2 * Theme.l
    implicitHeight: 48
    radius: Theme.radius
    color: primary ? (area.pressed ? Theme.accentPressed : area.containsMouse ? Theme.accentHover : Theme.accent) : (area.pressed ? Theme.surfacePressed : area.containsMouse ? Theme.surfaceHover : Theme.surfaceRaised)
    border.color: primary ? "transparent" : Theme.border
    border.width: primary ? 0 : 1

    MouseArea {
        id: area
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        Accessible.ignored: true
        onClicked: Nav.go(button.href)
    }
    Text {
        id: words
        anchors.centerIn: parent
        textFormat: Text.RichText
        text: Nav.anchor(button.href, button.label, false)
        color: button.primary ? Theme.textOnAccent : Theme.text
        linkColor: color
        font.family: Theme.sans
        font.pixelSize: Theme.bodySize
        font.weight: Font.DemiBold
        lineHeightMode: Text.FixedHeight
        lineHeight: Theme.bodyLine
        onLinkActivated: (to) => Nav.go(to)
    }
}
