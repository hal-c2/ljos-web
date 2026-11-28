import Ljos.Ui
import Ljos.Core
import Ljos.Layout
import "logic/place.ts" as Place
import "logic/review.ts" as Review
import Site
import "../nav.js" as Nav
import "later.js" as Later

// The framework review: one app written in each framework, its numbers
// side by side for the frameworks picked, the same feature in each one's
// code, and each framework in the words of a fan, with where it is not
// as strong. What it says is data (Review/review.json, carried in
// ReviewBuilt.data), so the page names no framework itself.
Column {
    id: page

    property bool wide: Place.wideIn(parent)
    property Flickable scroller

    readonly property Review.Review review: Review.reviewOf(ReviewBuilt.data)
    // The frameworks compared, by id, in the order they were picked.
    property list<string> picked: page.review.picked.slice()
    // The page runs in a browser and has come to life: a bar picked from
    // here on eases in. The bars the build drew stand as they are.
    property bool live: false
    property bool tabled: false
    // The renderer set the numbers are shown in, by its id: the GPU's
    // first.
    property string set: Review.firstSet(page.review)
    // What the first load leaves out (the other sets, Firefox's numbers,
    // the words of the frameworks it does not open with),
    // imported once a reader asks for them; until then the charts stay
    // on the first set.
    // Not `later`: that name is the page's call for after this frame.
    property Review.Later more: Review.notYet()
    property bool asked: false
    readonly property string shown: page.set === Review.firstSet(page.review) ? page.set : Review.shownSet(page.review, page.set, page.more)

    onSetChanged: {
        if (page.set !== Review.firstSet(page.review))
            page.askLater();
    }
    onTabledChanged: {
        if (page.tabled)
            page.askLater();
    }
    // A framework picked that the page did not open with has its words
    // in the later data too.
    onPickedChanged: {
        if (Review.wordsLater(page.review, page.picked, page.more))
            page.askLater();
    }

    function askLater(): void {
        if (page.asked)
            return;
        page.asked = true;
        Later.reviewLater().then((module: Later.Module) => {
            page.more = Review.laterOf(module.default);
        }, (error: unknown) => {
            // Asked again the next time: a network that failed once may not.
            page.asked = false;
            console.warn(`the review's other sets did not load: ${error}`);
        });
    }

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
        // Every excerpt below is cut from an app published whole, with
        // its data and the scripts that measured it: a reader can build
        // and run them all.
        Text {
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width : 0
            width: Math.min(parent.width, Theme.measure)
            readonly property string runLink: Nav.anchor(page.review.repo.href, t`Run it yourself`, true, Theme.link)
            readonly property string published: t`Each app's whole code, its data and the scripts that measured them are in one repository, at the commit measured here.`
            format: Text.RichText
            text: `${published} ${runLink}`
            color: Theme.textMuted
            linkColor: Theme.link
            font.family: Theme.sans
            font.size: Theme.bodySize
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.bodyLine
            wrap: Text.Wrap
            onLinkActivated: (to) => Nav.go(to)
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
                required property Review.Kind modelData
                width: page.width
                spacing: Theme.xs
                Accessible.role: Accessible.Grouping
                Accessible.name: kind.modelData.label
                Text {
                    Accessible.ignored: true
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
            text: t`Each bar is the median of its runs, the line across its end the least to the most; the native search's bar is the slow end of every key typed, and the web's the first key's, as each chart says. Under each chart, the command that measured it. Shorter is better on every chart. One machine, shared and busy, in the renderer set chosen below: the numbers compare with each other, not with your computer.`
            color: Theme.textMuted
            font.family: Theme.sans
            font.size: Theme.bodySize - 1
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.bodyLine - 2
            wrap: Text.Wrap
        }
        ReviewRenderers {
            width: parent.width
            review: page.review
            chosen: page.set
            onChosenChanged: page.set = chosen
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
            set: page.shown
            more: page.more
        }
        Text {
            visible: page.review.firefox !== undefined
            width: Math.min(parent.width, Theme.measure)
            text: Review.firefoxConditions(page.review)
            color: Theme.textMuted
            font.family: Theme.sans
            font.size: Theme.captionSize
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.captionLine
            wrap: Text.Wrap
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
                    // The first set's numbers are in the first load: a
                    // chart on it does not follow the later data, so the
                    // words coming in for a framework picked do not make
                    // its bars anew mid-fade.
                    metric: page.shown === Review.firstSet(page.review) ? Review.inSet(modelData, page.shown) : Review.inSet(modelData, page.shown, page.more)
                    set: page.shown
                    picked: page.picked
                    live: page.live
                    wide: page.wide
                }
            }
        }
        Text {
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width : 0
            width: Math.min(parent.width, Theme.measure)
            text: t`No chart of build times: each app's builds ran through one queue shared with other work, so its times are mostly the wait, and they do not compare.`
            color: Theme.textMuted
            font.family: Theme.sans
            font.size: Theme.bodySize - 1
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.bodyLine - 2
            wrap: Text.Wrap
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

        Column {
            width: parent.width
            spacing: Theme.s

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
            Text {
                x: App.layoutDirection === Direction.RightToLeft ? parent.width - width : 0
                width: Math.min(parent.width, Theme.measure)
                text: t`The frameworks picked above, each in the words of someone who loves it. Pick another to read its fan.`
                color: Theme.textMuted
                font.family: Theme.sans
                font.size: Theme.bodySize
                lineHeightMode: Text.FixedHeight
                lineHeight: Theme.bodyLine
                wrap: Text.Wrap
            }
        }
        // The picked frameworks' sections only, by id, so a section that
        // stays picked stays as it is.
        Repeater {
            model: Review.inOrder(page.review, page.picked)
            ReviewSection {
                required property string modelData
                width: page.width
                review: page.review
                framework: Review.framed(page.review, modelData, page.more)
                wide: page.wide
                live: page.live
                scroller: page.scroller
            }
        }
    }

    // Every framework, picked or not, a link away.
    Column {
        width: parent.width
        spacing: Theme.m
        Accessible.role: Accessible.Section
        Accessible.name: t`Where to find each one`

        Text {
            width: parent.width
            text: t`Where to find each one`
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
        Flow {
            width: parent.width
            spacing: Theme.xs
            Repeater {
                model: page.review.frameworks
                Flow {
                    id: found
                    required property Review.Framework modelData
                    width: page.wide ? (parent.width - Theme.xs) / 2 : parent.width
                    LinkButton {
                        quiet: true
                        label: t`${found.modelData.name} website`
                        href: found.modelData.links.site
                    }
                    LinkButton {
                        quiet: true
                        label: t`${found.modelData.name} docs`
                        href: found.modelData.links.docs
                    }
                    LinkButton {
                        quiet: true
                        label: t`${found.modelData.name} repository`
                        href: found.modelData.links.repo
                    }
                }
            }
        }
    }
}
