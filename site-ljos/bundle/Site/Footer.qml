import QtQuick
import Site
import Ljos.Core
import "../nav.js" as Nav

// Under every page: what Ljós is in a line, where to go, the principles
// it follows, and its licence.
Rectangle {
    id: footer
    Accessible.role: Accessible.Footer

    property int gutter: Theme.gutterWide
    property int measure: Theme.pageWidth
    // The route of the page the footer closes, which the mark's address
    // is written from.
    property string route: "/"

    height: inner.implicitHeight + 2 * Theme.xl
    color: Theme.surface

    Rectangle {
        anchors.left: parent.left
        anchors.right: parent.right
        height: 1
        color: Theme.divider
    }

    Column {
        id: inner
        width: Math.min(footer.measure, footer.width - 2 * footer.gutter)
        x: Math.round((footer.width - width) / 2)
        y: Theme.xl
        spacing: Theme.s

        Row {
            width: parent.width
            spacing: 8
            // In the page as written, as the header's is (Nav.picture).
            // Its size is given: a picture has none until it loads, and
            // the row leaves out what has none.
            Text {
                id: mark
                width: 20
                height: 20
                anchors.verticalCenter: parent.verticalCenter
                textFormat: Text.RichText
                text: Nav.picture(footer.route, "/favicon.svg", 20, 20, "")
                Accessible.ignored: true
            }
            // What is left of the row beside the mark, wrapped where a
            // phone has less than its one line.
            Wordmark {
                width: parent.width - mark.width - parent.spacing
                anchors.verticalCenter: parent.verticalCenter
                wrapMode: Text.Wrap
                text: "Ljós — malleable software, everywhere"
                font.pixelSize: 16
                font.weight: Font.DemiBold
            }
        }
        Flow {
            width: parent.width
            spacing: Theme.l

            NavLink { label: t`Docs`; to: "/start/"; muted: true; size: Theme.captionSize + 1; line: Theme.captionLine }
            NavLink { label: t`Demos`; to: "/demos/"; muted: true; size: Theme.captionSize + 1; line: Theme.captionLine }
            NavLink { label: t`Showcase`; to: "/showcase/"; muted: true; size: Theme.captionSize + 1; line: Theme.captionLine }
            NavLink { label: t`Your first app`; to: "/start/first-app/"; muted: true; size: Theme.captionSize + 1; line: Theme.captionLine }
            NavLink { label: t`GitHub`; to: "https://github.com/hal-c2/ljos-ui"; muted: true; size: Theme.captionSize + 1; line: Theme.captionLine }
            // How the project means to work together, on every page.
            NavLink { label: t`Community principles`; to: "https://community-software.org/"; muted: true; size: Theme.captionSize + 1; line: Theme.captionLine }
            NavLink { label: t`MIT licence`; to: "https://github.com/hal-c2/ljos-ui/blob/main/LICENSE"; muted: true; size: Theme.captionSize + 1; line: Theme.captionLine }
        }
        Text {
            width: parent.width
            text: "This site is itself a Ljós app, written out as HTML at build time and brought to life in the page."
            color: Theme.textMuted
            font.family: Theme.sans
            font.pixelSize: Theme.captionSize
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.captionLine
            wrapMode: Text.Wrap
        }
    }
}
