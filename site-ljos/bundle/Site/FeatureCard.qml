import Ljos.Ui
import Ljos.Core
import Ljos.Layout
import Site
import "../nav.js" as Nav

// One of the landing page's points: a heading and the words under it,
// on a card of its own in the shell's look (Site/Panel.qml's: its
// corners, hairline and depth, or Cyberpunk's brackets). A card that
// leads somewhere lifts a little under the pointer.
Item {
    id: card

    property string title: ""
    property string body: ""
    // Where the card leads, if anywhere: its title is then the link,
    // and the whole card takes a press.
    property string href: ""
    // A small index over the title ("01"), in the mono face; none if empty.
    property string mark: ""
    // A capture over the title, if any: its address from the site's root
    // without an extension (Nav.capture), the dark scheme's if it has
    // one, what it shows, and its shape. `route` is the page's, which
    // the address is written from.
    property string picture: ""
    property string pictureDark: ""
    property string pictureAlt: ""
    property real pictureAspect: 10 / 16
    property string route: "/"
    readonly property int padding: Theme.l + Theme.xxs
    // What the card's words hold, for a row of cards to share the
    // tallest one's height.
    readonly property real contentHeight: words.implicitHeight + 2 * padding
    readonly property bool lifted: area.containsMouse
    signal followed(string href)

    height: contentHeight

    RectangularShadow {
        anchors.fill: face
        visible: Theme.shadowBlur > 0
        offset.y: card.lifted ? Theme.shadowY : Theme.shadowY / 2
        blur: card.lifted ? Theme.shadowBlur : Theme.shadowBlur / 2
        spread: -Theme.shadowBlur / 4
        radius: face.radius
        color: Theme.shadow
        opacity: card.lifted ? 1 : 0.5
        Accessible.ignored: true
        Behavior on opacity {
            NumberAnimation {
                duration: Theme.moveSmall
                easing.type: Easing.OutCubic
            }
        }
    }
    Rectangle {
        id: face
        anchors.fill: parent
        radius: Theme.brackets ? 0 : Theme.radiusLarge
        fill: card.lifted ? Theme.surfaceRaised : Theme.surface
        border.color: Theme.brackets ? "transparent" : card.lifted ? Theme.border : Theme.divider
        border.width: 1
        Accessible.ignored: true
    }
    Repeater {
        model: Theme.brackets ? 4 : 0
        Item {
            id: corner
            required property int index
            readonly property bool atRight: index % 2 === 1
            readonly property bool atBottom: index > 1
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (App.layoutDirection).
            readonly property real startX: atRight ? card.width - width : 0
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
            y: atBottom ? card.height - height : 0
            width: 14
            height: 14
            Accessible.ignored: true
            Rectangle {
                y: corner.atBottom ? corner.height - 2 : 0
                width: parent.width
                height: 2
                fill: Theme.accent
            }
            Rectangle {
                // Where it starts, read from the left; a right-to-left page
                // sets it as far from the right (App.layoutDirection).
                readonly property real startX: corner.atRight ? corner.width - 2 : 0
                x: App.layoutDirection === Direction.RightToLeft ? corner.width - width - startX : startX
                width: 2
                height: parent.height
                fill: Theme.accent
            }
        }
    }

    PointerArea {
        id: area
        anchors.fill: parent
        enabled: card.href !== ""
        hoverEnabled: card.href !== ""
        cursorShape: card.href !== "" ? Cursor.PointingHand : Cursor.Arrow
        Accessible.ignored: true
        onClicked: card.followed(card.href)
    }

    Column {
        id: words
        // As far from either side, so the same on a mirrored page.
        x: card.padding
        y: card.padding
        width: parent.width - 2 * card.padding
        spacing: Theme.s

        // Both pictures are in the page as written, each shown in its
        // scheme, as a demo frame's are (DemoFrame.qml).
        Rectangle {
            visible: card.picture !== ""
            width: parent.width
            height: visible ? Math.round(width * card.pictureAspect) + 2 : 0
            radius: Theme.brackets ? 0 : Theme.radius
            fill: Theme.canvas
            border.color: Theme.divider
            border.width: 1
            clip: true

            Repeater {
                model: card.picture === "" ? [] : card.pictureDark === "" ? [card.picture] : [card.picture, card.pictureDark]
                Text {
                    required property string modelData
                    required property int index
                    x: 1
                    y: 1
                    width: parent.width - 2
                    height: parent.height - 2
                    visible: card.pictureDark === "" || (index === 1) === Theme.dark
                    format: Text.RichText
                    text: Nav.capture(card.route, modelData, width, height, card.pictureAlt)
                }
            }
        }

        // The mark, set large, and a hairline running from it to the
        // card's edge: an index the eye finds before the words.
        Item {
            visible: card.mark !== ""
            width: parent.width
            height: visible ? markWords.implicitHeight + Theme.xs : 0
            Accessible.ignored: true

            // Anchored, so a right-to-left page mirrors the mark and the
            // hairline from it together.
            Text {
                id: markWords
                anchors.left: parent.left
                text: card.mark
                color: Theme.accent2Text
                font.family: Theme.mono
                font.size: Theme.subtitleSize
                font.weight: Font.Medium
                lineHeightMode: Text.FixedHeight
                lineHeight: Theme.subtitleLine
            }
            Rectangle {
                anchors.left: markWords.right
                anchors.leftMargin: Theme.s
                anchors.right: parent.right
                anchors.verticalCenter: markWords.verticalCenter
                height: 1
                fill: Theme.divider
            }
        }
        Text {
            width: parent.width
            format: card.href !== "" ? Text.RichText : Text.PlainText
            text: card.href !== "" ? Nav.anchor(Nav.at(Built.base, card.href), card.title, area.containsMouse, color) : card.title
            color: card.href !== "" ? Theme.link : Theme.onCanvasStrong
            linkColor: color
            font.family: Theme.sans
            font.size: Theme.titleSize - 3
            font.weight: Font.DemiBold
            font.letterSpacing: -0.2
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.titleLine - 2
            wrap: Text.Wrap
            // A card stands under its section's heading.
            readonly property int headingLevel: 3
            Accessible.role: Accessible.Heading
            onLinkActivated: (link) => card.followed(link)
        }
        Text {
            width: parent.width
            format: Text.RichText
            text: Nav.linked(Built.base, card.body)
            color: Theme.textMuted
            linkColor: Theme.link
            font.family: Theme.sans
            font.size: Theme.bodySize - 1
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.bodyLine - 2
            wrap: Text.Wrap
            onLinkActivated: (link) => card.followed(link)
        }
    }
}
