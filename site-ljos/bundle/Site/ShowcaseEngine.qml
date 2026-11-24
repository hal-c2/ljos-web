import Ljos.Ui
import Ljos.Layout
import Ljos.Core
import Site

// The engine an app is built on, as its entry in Showcase/products.json
// names it: a line that says so and links to it, then the engine in its
// own words. Those are lines of one of its examples, cut by the build
// from a copy of the file at the commit the entry names, each linked to
// those lines there; beside them, that example running, drawn off-screen.
Column {
    id: section

    required property var engine
    property string route: "/showcase/"
    property bool wide: true
    property var scroller: null

    readonly property var example: section.engine.example

    spacing: Theme.l

    Column {
        width: parent.width
        spacing: Theme.s

        Text {
            width: parent.width
            text: section.engine.heading
            color: Theme.text
            font.family: Theme.sans
            font.size: Theme.titleSize
            font.weight: Font.Bold
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.titleLine
            wrap: Text.Wrap
            readonly property int headingLevel: 3
            Accessible.role: Accessible.Heading
        }
        Text {
            width: Math.min(parent.width, Theme.measure)
            text: section.engine.line
            color: Theme.text
            font.family: Theme.sans
            font.size: Theme.bodySize + 1
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.bodyLine + 4
            wrap: Text.Wrap
        }
    }
    LinkButton {
        label: section.engine.label
        href: section.engine.href
    }
    Text {
        width: Math.min(parent.width, Theme.measure)
        text: section.example.about
        color: Theme.textMuted
        font.family: Theme.sans
        font.size: Theme.bodySize
        lineHeightMode: Text.FixedHeight
        lineHeight: Theme.bodyLine
        wrap: Text.Wrap
    }

    // The code and the world it makes: side by side on a desk, the
    // world under the code on a phone.
    Box {
        id: pair
        width: parent.width
        direction: section.wide ? Box.Row : Box.Column
        spacing: section.wide ? Theme.xl : Theme.l

        readonly property int side: section.wide ? Math.round((width - spacing) * 0.42) : width

        Column {
            width: section.wide ? pair.width - pair.spacing - pair.side : pair.width
            spacing: Theme.l

            Repeater {
                model: section.example.snippets
                Column {
                    id: snippet
                    required property var modelData
                    width: parent.width
                    spacing: Theme.xs

                    Text {
                        width: parent.width
                        text: snippet.modelData.says
                        color: Theme.text
                        font.family: Theme.sans
                        font.size: Theme.bodySize
                        lineHeightMode: Text.FixedHeight
                        lineHeight: Theme.bodyLine
                        wrap: Text.Wrap
                    }
                    CodeBlock {
                        width: parent.width
                        scroller: section.scroller
                        lang: "qml"
                        file: section.example.path
                        code: snippet.modelData.code
                        rich: snippet.modelData.rich
                    }
                    LinkButton {
                        quiet: true
                        label: snippet.modelData.link
                        href: snippet.modelData.href
                    }
                }
            }
        }
        ShowcaseCapture {
            width: pair.side
            capture: section.example.capture
            route: section.route
        }
    }
}
