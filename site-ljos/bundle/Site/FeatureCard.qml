import QtQuick
import Site
import "../nav.js" as Nav

// One of the landing page's points: a heading and the words under it,
// on a card of its own.
Rectangle {
    id: card

    property string title: ""
    property string body: ""
    // Where the card leads, if anywhere: its title is then the link,
    // and the whole card takes a press.
    property string href: ""
    // What the card's words hold, for a row of cards to share the
    // tallest one's height.
    readonly property real contentHeight: words.implicitHeight + 2 * Theme.l
    signal followed(string href)

    height: contentHeight
    radius: Theme.radiusLarge
    color: Theme.surface
    border.color: Theme.divider
    border.width: 1

    MouseArea {
        id: area
        anchors.fill: parent
        enabled: card.href !== ""
        hoverEnabled: card.href !== ""
        cursorShape: card.href !== "" ? Qt.PointingHandCursor : Qt.ArrowCursor
        Accessible.ignored: true
        onClicked: card.followed(card.href)
    }
    Rectangle {
        anchors.fill: parent
        radius: parent.radius
        color: Theme.surfaceHover
        opacity: area.containsMouse ? 0.5 : 0
        Accessible.ignored: true
    }

    Column {
        id: words
        x: Theme.l
        y: Theme.l
        width: parent.width - 2 * Theme.l
        spacing: Theme.xs

        Text {
            width: parent.width
            textFormat: card.href !== "" ? Text.RichText : Text.PlainText
            text: card.href !== "" ? Nav.anchor(card.href, card.title, area.containsMouse) : card.title
            color: card.href !== "" ? Theme.link : Theme.text
            linkColor: color
            font.family: Theme.sans
            font.pixelSize: Theme.titleSize - 3
            font.weight: Font.DemiBold
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.titleLine
            wrapMode: Text.Wrap
            Accessible.role: Accessible.Heading
            onLinkActivated: (link) => card.followed(link)
        }
        Text {
            width: parent.width
            textFormat: Text.RichText
            text: card.body
            color: Theme.textMuted
            linkColor: Theme.link
            font.family: Theme.sans
            font.pixelSize: Theme.bodySize - 1
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.bodyLine
            wrapMode: Text.Wrap
            onLinkActivated: (link) => card.followed(link)
        }
    }
}
