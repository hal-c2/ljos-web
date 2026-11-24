import QtQuick
import Site
import Ljos.Core
import "../nav.js" as Nav

// Under every page: what Ljós is in a line, where to go, the principles
// it follows, and its licence. On a wide page it stands on the page's
// grid, the name and its line on the first five columns and the links
// on the last ones; on a phone or beside the docs it stacks.
Rectangle {
    id: footer
    Accessible.role: Accessible.Footer

    property int gutter: Theme.gutterWide
    property int measure: Theme.pageWidth
    // The route of the page the footer closes, which the mark's address
    // is written from.
    property string route: "/"
    readonly property int innerWidth: Math.min(footer.measure, footer.width - 2 * footer.gutter)
    readonly property bool spread: innerWidth >= 900
    readonly property real column: (innerWidth - (Theme.columns - 1) * Theme.columnGap) / Theme.columns

    height: inner.implicitHeight + Theme.xxl + Theme.xl
    color: Theme.surface

    Rectangle {
        anchors.left: parent.left
        anchors.right: parent.right
        height: 1
        color: Theme.divider
    }

    Column {
        id: inner
        width: footer.innerWidth
        x: Math.round((footer.width - width) / 2)
        y: Theme.xxl
        spacing: Theme.xl

        Item {
            width: parent.width
            height: footer.spread ? Math.max(said.implicitHeight, links.implicitHeight) : said.implicitHeight + Theme.xl + links.implicitHeight

            Column {
                id: said
                width: footer.spread ? Math.round(5 * footer.column + 4 * Theme.columnGap) : parent.width
                spacing: Theme.s

                // The logo, in the page as written, as the header's is
                // (Nav.picture). Its size is given: a picture has none
                // until it loads, and the column leaves out what has none.
                Text {
                    height: 32
                    width: Math.round(height * Theme.logoAspect)
                    textFormat: Text.RichText
                    text: Nav.picture(footer.route, "/ljos.svg", width, height, t`Ljós`)
                }
                Text {
                    width: parent.width
                    wrapMode: Text.Wrap
                    text: t`Malleable software, everywhere.`
                    color: Theme.text
                    font.family: Theme.sans
                    font.pixelSize: Theme.bodySize
                    font.weight: Font.DemiBold
                    lineHeightMode: Text.FixedHeight
                    lineHeight: Theme.bodyLine
                }
            }
            Row {
                id: links
                x: footer.spread ? parent.width - width : 0
                y: footer.spread ? Theme.xs : said.implicitHeight + Theme.xl
                spacing: footer.spread ? Theme.xxxl : Theme.xxl

                Column {
                    spacing: Theme.s
                    Text {
                        text: t`Learn`
                        color: Theme.textMuted
                        font.family: Theme.sans
                        font.pixelSize: Theme.captionSize
                        font.weight: Font.DemiBold
                        font.letterSpacing: 1.1
                        font.capitalization: Font.AllUppercase
                        Accessible.ignored: true
                    }
                    NavLink { label: t`Docs`; to: "/start/"; size: Theme.captionSize + 1; line: Theme.captionLine + 4 }
                    NavLink { label: t`Demos`; to: "/demos/"; size: Theme.captionSize + 1; line: Theme.captionLine + 4 }
                    NavLink { label: t`Showcase`; to: "/showcase/"; size: Theme.captionSize + 1; line: Theme.captionLine + 4 }
                    NavLink { label: t`Your first app`; to: "/start/first-app/"; size: Theme.captionSize + 1; line: Theme.captionLine + 4 }
                }
                Column {
                    spacing: Theme.s
                    Text {
                        text: t`Project`
                        color: Theme.textMuted
                        font.family: Theme.sans
                        font.pixelSize: Theme.captionSize
                        font.weight: Font.DemiBold
                        font.letterSpacing: 1.1
                        font.capitalization: Font.AllUppercase
                        Accessible.ignored: true
                    }
                    NavLink { label: t`GitHub`; to: "https://github.com/hal-c2/ljos-ui"; size: Theme.captionSize + 1; line: Theme.captionLine + 4 }
                    // How the project means to work together, on every page.
                    NavLink { label: t`Community principles`; to: "https://community-software.org/"; size: Theme.captionSize + 1; line: Theme.captionLine + 4 }
                    NavLink { label: t`MIT licence`; to: "https://github.com/hal-c2/ljos-ui/blob/main/LICENSE"; size: Theme.captionSize + 1; line: Theme.captionLine + 4 }
                }
            }
        }
        Rectangle {
            width: parent.width
            height: 1
            color: Theme.divider
        }
        Text {
            width: parent.width
            text: "This site is itself a Ljós app, written to HTML when it’s built and live in your browser."
            color: Theme.textMuted
            font.family: Theme.sans
            font.pixelSize: Theme.captionSize
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.captionLine
            wrapMode: Text.Wrap
        }
    }
}
