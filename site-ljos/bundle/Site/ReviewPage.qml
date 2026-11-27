import Ljos.Ui
import Ljos.Core
import Ljos.Layout
import "logic/place.ts" as Place
import "logic/review.ts" as Review
import Site
import "../nav.js" as Nav

// The framework review: one app written in each framework, its numbers
// side by side for the frameworks picked, the same feature in each one's
// code, and each framework in the words of a fan, with where it is not
// as strong. What it says is data (Review/review.json, carried in
// ReviewBuilt.data), so the page names no framework itself.
Column {
    id: page

    property bool wide: Place.wideIn(parent)
    property Flickable scroller

    readonly property Review.Review review: ReviewBuilt.data
    // The frameworks compared, by id, in the order they were picked.
    property list<string> picked: page.review.picked.slice()
    // The page runs in a browser and has come to life: a bar picked from
    // here on eases in. The bars the build drew stand as they are.
    property bool live: false
    property bool tabled: false

    width: parent !== null ? parent.width : 680
    spacing: page.wide ? Theme.xxxl : Theme.xxl
    topPadding: page.wide ? Theme.xl : Theme.m

    Component.onCompleted: {
        if (Nav.inBrowser())
            later(() => page.live = true);
    }

    function press(id: string): void {
        page.picked = Review.toggled(page.picked, id);
    }

    Column {
        width: parent.width
        spacing: Theme.s

        Text {
            width: parent.width
            text: t`Totally biased review of mostly Rust UI frameworks`
            color: Theme.text
            font.family: Theme.sans
            font.size: page.wide ? Theme.displaySize : Theme.compactDisplaySize
            font.weight: Font.Bold
            lineHeightMode: Text.FixedHeight
            lineHeight: page.wide ? Theme.displayLine : Theme.compactDisplayLine
            wrap: Text.Wrap
            readonly property int headingLevel: 1
            Accessible.role: Accessible.Heading
        }
        Text {
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width : 0
            width: Math.min(parent.width, Theme.measure)
            text: page.review.intro.text
            color: Theme.textMuted
            font.family: Theme.sans
            font.size: Theme.subtitleSize - 1
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.subtitleLine - 2
            wrap: Text.Wrap
        }
        Text {
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width : 0
            width: Math.min(parent.width, Theme.measure)
            text: page.review.app.about
            color: Theme.textMuted
            font.family: Theme.sans
            font.size: Theme.bodySize
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.bodyLine
            wrap: Text.Wrap
        }
        // Said once, above everything it covers, while any number,
        // excerpt or words are not the real ones yet.
        Rectangle {
            visible: Review.anyPlaceholder(page.review)
            width: Math.min(parent.width, Theme.measure)
            height: notice.height + 2 * Theme.s
            radius: Theme.radiusSmall
            fill: Theme.surfaceRaised
            border.color: Theme.border
            border.width: 1
            Column {
                id: notice
                x: Theme.m
                y: Theme.s
                width: parent.width - 2 * Theme.m
                spacing: Theme.xxs
                Text {
                    text: t`Placeholder data`
                    color: Theme.text
                    font.family: Theme.sans
                    font.size: Theme.bodySize
                    font.weight: Font.DemiBold
                }
                Text {
                    width: parent.width
                    text: t`Some numbers, code or words here stand in for what is still being measured and written. Each placeholder number says so in the table.`
                    color: Theme.textMuted
                    font.family: Theme.sans
                    font.size: Theme.captionSize + 1
                    lineHeightMode: Text.FixedHeight
                    lineHeight: Theme.captionLine + 2
                    wrap: Text.Wrap
                }
            }
        }
    }

    // The picker: every framework, native and web, a press away from
    // being compared or put back.
    Column {
        width: parent.width
        spacing: Theme.s
        Accessible.role: Accessible.Grouping
        Accessible.name: t`Frameworks to compare`

        Text {
            width: parent.width
            text: t`Pick the frameworks to compare`
            color: Theme.text
            font.family: Theme.sans
            font.size: page.wide ? Theme.headlineSize - 2 : Theme.headlineSize - 6
            font.weight: Font.Bold
            lineHeightMode: Text.FixedHeight
            lineHeight: page.wide ? Theme.headlineLine - 4 : Theme.headlineLine - 8
            wrap: Text.Wrap
            readonly property int headingLevel: 2
            Accessible.role: Accessible.Heading
        }
        Repeater {
            model: [
                { kind: "native", label: t`Native` },
                { kind: "web", label: t`Web` }
            ]
            Column {
                id: kind
                required property unknown modelData
                width: page.width
                spacing: Theme.xs
                Text {
                    text: kind.modelData.label
                    color: Theme.textMuted
                    font.family: Theme.sans
                    font.size: Theme.captionSize
                    font.weight: Font.DemiBold
                }
                Flow {
                    width: parent.width
                    spacing: Theme.xs
                    Repeater {
                        model: Review.ofKind(page.review, kind.modelData.kind)
                        StageButton {
                            required property Review.Framework modelData
                            text: modelData.name
                            checkable: true
                            checked: page.picked.includes(modelData.id)
                            onPressed: page.press(modelData.id)
                        }
                    }
                }
            }
        }
        Text {
            visible: page.picked.length <= Review.FEWEST
            width: parent.width
            text: t`Compare at least two.`
            color: Theme.textMuted
            font.family: Theme.sans
            font.size: Theme.captionSize
        }
    }

    // The numbers: a chart per metric, or one table of them all.
    Column {
        width: parent.width
        spacing: Theme.l

        Text {
            width: parent.width
            text: t`The numbers`
            color: Theme.text
            font.family: Theme.sans
            font.size: page.wide ? Theme.headlineSize - 2 : Theme.headlineSize - 6
            font.weight: Font.Bold
            lineHeightMode: Text.FixedHeight
            lineHeight: page.wide ? Theme.headlineLine - 4 : Theme.headlineLine - 8
            wrap: Text.Wrap
            readonly property int headingLevel: 2
            Accessible.role: Accessible.Heading
        }
        Text {
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width : 0
            width: Math.min(parent.width, Theme.measure)
            text: t`Each bar is the median of its runs, the line across its end the least to the most, and under each chart the command that measured it. Shorter is better on every chart.`
            color: Theme.textMuted
            font.family: Theme.sans
            font.size: Theme.bodySize - 1
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.bodyLine - 2
            wrap: Text.Wrap
        }
        StageButton {
            // Pressed while the table stands in for the charts.
            text: t`Show the numbers as a table`
            checkable: true
            checked: page.tabled
            onPressed: page.tabled = !page.tabled
        }
        ReviewTable {
            visible: page.tabled
            width: parent.width
            review: page.review
            picked: page.picked
        }
        Flow {
            visible: !page.tabled
            width: parent.width
            spacing: Theme.xl
            Repeater {
                model: page.review.metrics
                ReviewChart {
                    required property Review.Metric modelData
                    width: page.wide ? Math.floor((page.width - Theme.xl) / 2) : page.width
                    review: page.review
                    metric: modelData
                    picked: page.picked
                    live: page.live
                    wide: page.wide
                }
            }
        }
    }

    Column {
        width: parent.width
        spacing: Theme.l

        Text {
            width: parent.width
            text: t`The same feature in each one's code`
            color: Theme.text
            font.family: Theme.sans
            font.size: page.wide ? Theme.headlineSize - 2 : Theme.headlineSize - 6
            font.weight: Font.Bold
            lineHeightMode: Text.FixedHeight
            lineHeight: page.wide ? Theme.headlineLine - 4 : Theme.headlineLine - 8
            wrap: Text.Wrap
            readonly property int headingLevel: 2
            Accessible.role: Accessible.Heading
        }
        ReviewCode {
            width: parent.width
            review: page.review
            picked: page.picked
            wide: page.wide
            scroller: page.scroller
        }
    }

    Column {
        width: parent.width
        spacing: Theme.xxl

        Text {
            width: parent.width
            text: t`Each framework, by a fan`
            color: Theme.text
            font.family: Theme.sans
            font.size: page.wide ? Theme.headlineSize - 2 : Theme.headlineSize - 6
            font.weight: Font.Bold
            lineHeightMode: Text.FixedHeight
            lineHeight: page.wide ? Theme.headlineLine - 4 : Theme.headlineLine - 8
            wrap: Text.Wrap
            readonly property int headingLevel: 2
            Accessible.role: Accessible.Heading
        }
        Repeater {
            model: page.review.frameworks
            ReviewSection {
                required property Review.Framework modelData
                width: page.width
                framework: modelData
                wide: page.wide
                scroller: page.scroller
            }
        }
    }
}
