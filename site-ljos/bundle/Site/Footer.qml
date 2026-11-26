pragma Scripts: JavaScript
import Ljos.Ui
import Ljos.Layout
import Site
import Ljos.Core
import "../nav.js" as Nav

// Under every page: what Ljós is in a line, where to go, the principles
// it follows, its licence, and what is built with it. On a wide page it
// stands on the page's grid, the name and its line on the first five
// columns and the links on the last ones; on a phone or beside the docs
// it stacks.
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
    fill: Theme.surface

    Rectangle {
        anchors.left: parent.left
        anchors.right: parent.right
        height: 1
        fill: Theme.divider
    }

    Column {
        id: inner
        width: footer.innerWidth
        // Where it starts, read from the left; a right-to-left page
        // sets it as far from the right (LayoutMirroring).
        readonly property real startX: Math.round((footer.width - width) / 2)
        x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
        y: Theme.xxl
        spacing: Theme.xl

        Item {
            width: parent.width
            height: footer.spread ? Math.max(said.implicitHeight, links.implicitHeight) : said.implicitHeight + Theme.xl + links.implicitHeight

            Column {
                id: said
                width: footer.spread ? Math.round(5 * footer.column + 4 * Theme.columnGap) : parent.width
                // Beside the links, it changes sides with them on a right-to-left page.
                x: App.layoutDirection === Direction.RightToLeft ? parent.width - width : 0
                spacing: Theme.s

                // The logo, in the page as written, as the header's is
                // (Nav.picture). Its size is given: a picture has none
                // until it loads, and the column leaves out what has none.
                Text {
                    height: 32
                    width: Math.round(height * Theme.logoAspect)
                    format: Text.RichText
                    text: Nav.picture(footer.route, "/ljos.svg", width, height, t`Ljós`)
                }
                Text {
                    width: parent.width
                    wrap: Text.Wrap
                    text: t`Malleable software, everywhere.`
                    color: Theme.text
                    font.family: Theme.sans
                    font.size: Theme.bodySize
                    font.weight: Font.DemiBold
                    lineHeightMode: Text.FixedHeight
                    lineHeight: Theme.bodyLine
                }
            }
            // Three columns of links where they fit, two on a phone.
            Grid {
                id: links
                // Where it starts, read from the left; a right-to-left page
                // sets it as far from the right (LayoutMirroring).
                readonly property real startX: footer.spread ? parent.width - width : 0
                x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
                y: footer.spread ? Theme.xs : said.implicitHeight + Theme.xl
                columns: footer.spread || footer.innerWidth >= 560 ? 3 : 2
                columnSpacing: footer.spread ? Theme.xxxl : Theme.xxl
                rowSpacing: Theme.xl

                Column {
                    spacing: Theme.s
                    Text {
                        text: t`Learn`
                        color: Theme.textMuted
                        font.family: Theme.sans
                        font.size: Theme.captionSize
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
                        font.size: Theme.captionSize
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
                // What is built with Ljós (Site/BuiltWith.qml), each at its source.
                Column {
                    spacing: Theme.s
                    Text {
                        text: t`Built with Ljós`
                        color: Theme.textMuted
                        font.family: Theme.sans
                        font.size: Theme.captionSize
                        font.weight: Font.DemiBold
                        font.letterSpacing: 1.1
                        font.capitalization: Font.AllUppercase
                        Accessible.ignored: true
                    }
                    NavLink { label: t`Ljós Studio`; to: "https://github.com/hal-c2/ljos-studio"; size: Theme.captionSize + 1; line: Theme.captionLine + 4 }
                    NavLink { label: t`Eldur`; to: "https://github.com/hal-c2/eldur"; size: Theme.captionSize + 1; line: Theme.captionLine + 4 }
                    NavLink { label: t`Ljós Hof`; to: "https://github.com/hal-c2/ljos-hof"; size: Theme.captionSize + 1; line: Theme.captionLine + 4 }
                    NavLink { label: t`HAL-C2`; to: "https://github.com/hal-c2/hal-c2"; size: Theme.captionSize + 1; line: Theme.captionLine + 4 }
                }
            }
        }
        Rectangle {
            width: parent.width
            height: 1
            fill: Theme.divider
        }
        Text {
            width: parent.width
            text: t`This site is itself a Ljós app, written to HTML when it’s built and live in your browser.`
            color: Theme.textMuted
            font.family: Theme.sans
            font.size: Theme.captionSize
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.captionLine
            wrap: Text.Wrap
        }
    }
}
