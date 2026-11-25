import Ljos.Core
import QtQuick
import Site
import "../nav.js" as Nav
import "logic/place.ts" as Place

// What the site's search found (Search), drawn under its field: a
// module of its own (later.js), fetched once there is a query.
Rectangle {
    id: list
    // The field it lists for, from what loads it (Search).
    readonly property var search: Place.searchIn(parent)
    width: list.search ? Math.max(list.search.width, 320) : 320
    height: found.implicitHeight + 2 * Theme.xs
    radius: Theme.radius
    color: Theme.surfaceRaised
    border.color: Theme.border
    border.width: 1
    // A list of none is no list: what stands then is the line
    // that says nothing was found.
    Accessible.role: list.search.results.length > 0 ? Accessible.List : Accessible.NoRole
    Accessible.name: t`Search results`

    Column {
        id: found
        // Where it starts, read from the left; a right-to-left page
        // sets it as far from the right (LayoutMirroring).
        readonly property real startX: Theme.xs
        x: LayoutMirroring.enabled ? parent.width - width - startX : startX
        y: Theme.xs
        width: parent.width - 2 * Theme.xs

        Text {
            width: parent.width
            visible: list.search.results.length === 0
            leftPadding: Theme.s
            topPadding: Theme.xs
            bottomPadding: Theme.xs
            text: list.search.pages === null ? list.search.trouble : t`Nothing matches “${query}”. Try a type name, like ListView.`
            // The reader's words as they typed them, never as markup.
            textFormat: Text.PlainText
            readonly property string query: list.search.query
            color: Theme.textMuted
            font.family: Theme.sans
            font.pixelSize: Theme.bodySize
            wrapMode: Text.Wrap
        }
        Repeater {
            model: list.search.results

            Rectangle {
                required property var modelData
                required property int index

                width: found.width
                height: words.implicitHeight + 2 * Theme.xs
                radius: Theme.radiusSmall
                color: index === list.search.chosen ? Theme.surfaceSelected : over.hovered ? Theme.surfaceHover : "transparent"
                Accessible.role: Accessible.ListItem
                Accessible.name: modelData.where ? modelData.title + ", in " + modelData.where : modelData.title
                Accessible.selected: index === list.search.chosen

                // Over the words too: hover is the row's, whatever in it
                // the mouse is over.
                HoverHandler {
                    id: over
                    cursorShape: Qt.PointingHandCursor
                    onHoveredChanged: if (hovered) list.search.chosen = index
                }
                // Under the words, not over them: the result's link is
                // then the topmost thing in the page where it stands,
                // so a modified click on it is the browser's (a new
                // tab, a new window), and the rest of the row goes
                // there in this one.
                MouseArea {
                    anchors.fill: parent
                    Accessible.ignored: true
                    // Off the link, a modified press is not for this tab.
                    onPressed: (mouse) => mouse.accepted = (mouse.modifiers & (Qt.ControlModifier | Qt.MetaModifier | Qt.ShiftModifier)) === 0
                    onClicked: list.search.go(index)
                }

                Column {
                    id: words
                    // Where it starts, read from the left; a right-to-left page
                    // sets it as far from the right (LayoutMirroring).
                    readonly property real startX: Theme.s
                    x: LayoutMirroring.enabled ? parent.width - width - startX : startX
                    y: Theme.xs
                    width: parent.width - 2 * Theme.s

                    Text {
                        width: parent.width
                        textFormat: Text.RichText
                        text: Nav.anchor(Nav.at(Content.base, modelData.href), modelData.title, false, color)
                        color: Theme.text
                        linkColor: Theme.text
                        font.family: Theme.sans
                        font.pixelSize: Theme.bodySize
                        font.weight: Font.DemiBold
                        lineHeightMode: Text.FixedHeight
                        lineHeight: Theme.bodyLine
                        // A link is rich text, which is never elided:
                        // a title wider than the list wraps inside it,
                        // between words, or within a word too long
                        // for a line.
                        wrapMode: Text.Wrap
                        onLinkActivated: (to) => list.search.go(index)
                    }
                    Text {
                        width: parent.width
                        visible: modelData.where !== ""
                        text: modelData.where
                        color: Theme.textMuted
                        font.family: Theme.sans
                        font.pixelSize: Theme.captionSize
                        lineHeightMode: Text.FixedHeight
                        lineHeight: Theme.captionLine
                        elide: Text.ElideRight
                    }
                }
            }
        }
    }
}
