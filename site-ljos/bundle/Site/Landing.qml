import Ljos.Ui
import Ljos.Core
import Ljos.Layout
import Ljos.Blocks
import Site
import Demos
import "../Demos/later.js" as Later
import "../nav.js" as Nav

// The front page, read top to bottom: what Ljós is and a replay that
// shows it, what that means for agents with a live app to drive, a shell
// the reader changes here, TypeScript and the rest in a card each, a
// smartwatch in 3D, how the project works, and where to go next.
// Existing QML is named once, as the way in; the porting page tells
// that story. The words are the page's; how they stand (the hero beside
// its live app, the sections on the grid, rising in as they are first
// seen) is Site's, which each shell dresses.
Column {
    id: landing

    // The flickable the page scrolls in, for the demos to know when
    // they are on screen; and whether the window is a wide one.
    property unknown scroller
    property bool wide: true
    // Prose reads at a measure, whatever the page's width.
    readonly property int prose: Math.min(width, Theme.measure)
    readonly property int textWidth: width

    width: parent !== null ? parent.width : 680
    // Sections stand well apart: each is one thing, said and shown.
    spacing: wide ? 2 * Theme.xxxl : Theme.xxxl + Theme.m
    // The grid's column and gap, for the sections that lay out on it.
    readonly property int gap: wide ? Theme.columnGap : Theme.compactColumnGap

    function follow(link: string): void {
        Nav.go(link);
    }

    // What Ljós is, and beside it (under it, on a narrower page) the
    // replay that shows it: an app reshaped while it runs, the TypeScript
    // that does it and the controls to do it by hand, in the first screen.
    // The words take four of the grid's columns, and the replay stands
    // beside them where the rest is room for its code beside the app.
    Hero {
        width: parent.width
        wide: landing.wide
        wordsColumns: 4
        stageFrom: AgentReplay.sideBySide
        // Cyberpunk's console says it tersely (copy v2, shells.md).
        readonly property bool terse: Theme.shell === "cyberpunk"
        eyebrow: terse ? t`Live runtime on an open tree` : ""
        title: terse ? t`Reshape the running interface, human or agent.` : LandingCopy.headline
        subtitle: terse ? t`Inspect every node, patch state in flight, drop a new shell on the wire.` : LandingCopy.subhead
        caption: LandingCopy.heroCaption
        onFollowed: (link) => landing.follow(link)

        LinkButton {
            primary: true
            label: LandingCopy.start
            href: "/start/first-app/"
        }
        LinkButton {
            label: LandingCopy.tryDemo
            href: "/demos/"
        }

        // The replay, the page's first demo. Its poster is the session's
        // end, the board, drawn by the page: the hero is whole before
        // anything is fetched and for a reader who wants less motion. For
        // everyone else it starts itself, as the list, and is reshaped.
        stage: ReplayFrame {
            width: parent.width
            scroller: landing.scroller
            aspect: 0.1
            // As high as it says (AgentView): the board at its fullest, and,
            // stacked, its code after that.
            note: LandingCopy.heroNote
            what: LandingCopy.heroWhat
            poster: Component {
                AgentPoster {}
            }
            source: Later.agent
        }
    }

    // Built for agents: what the replay shows, said, beside an app to
    // drive by hand, its source, the Observer and an agent's steps.
    Rise {
        Capability {
            id: agentic
            wide: landing.wide
            // Cyberpunk shows the live app as a console, under the words,
            // where the section is wide enough for one (DeviceFrame).
            stacked: Theme.consoleAt(width) === true
            eyebrow: LandingCopy.agenticEyebrow
            title: LandingCopy.agenticHeadline
            body: LandingCopy.agenticBody
            onFollowed: (link) => landing.follow(link)

            HeroStage {
                width: agentic.exampleWidth
            }
        }
    }

    // Make it your own: the point, said, shown in code, and run, the
    // words on the right this time.
    Rise {
        Capability {
            id: ownShell
            wide: landing.wide
            flip: true
            eyebrow: t`Malleable`
            title: t`Make it your own`
            body: t`An app’s layout doesn’t have to be fixed. Let people, or their agents, replace it live, without losing their work. If an edit won’t compile, the last working layout stays.`
            onFollowed: (link) => landing.follow(link)

            CodeBlock {
                width: ownShell.exampleWidth
                scroller: landing.scroller
                lang: "qml"
                code: LandingCode.ownShellCode
                rich: LandingCode.ownShellRich
            }
            // What to do with the playground under the section.
            Text {
                width: ownShell.exampleWidth
                format: Text.RichText
                color: Theme.text
                linkColor: Theme.link
                font.family: Theme.sans
                font.size: Theme.bodySize
                lineHeightMode: Text.FixedHeight
                lineHeight: Theme.bodyLine
                wrap: Text.Wrap
                topPadding: Theme.m
                text: t`<b>Try it on this shop.</b> Add something to the basket, then move <code>StatusSlot</code> in the code below. The layout changes and the basket keeps its items. Make a typo and the shop keeps working while you fix it.`
            }
        }
        Item {
            width: parent.width
            height: landing.wide ? Theme.xxl : Theme.xl
        }
        // The flagship malleable demo mounts into this slot, the page's
        // whole width: a small app whose shell the visitor rewrites on
        // the page, its state kept, a broken edit falling back with the
        // error shown. It is the page's point, so it is made with the
        // page, a playground and not an illustration.
        Slot {
            name: "showcase-shell"
            delegate: Component {
                PantryDemo {
                    width: landing.width
                    observerWhenIdle: false
                }
            }
        }
    }

    // The rest of what Ljós is, a card each, four of the grid's twelve
    // columns apiece.
    Rise {
        Grid {
            id: points

            readonly property int cardWidth: landing.wide ? Math.floor((landing.width - 2 * landing.gap) / 3) : landing.width
            readonly property real tallest: Math.max(typed.contentHeight, observed.contentHeight, stable.contentHeight)

            width: parent.width
            columns: landing.wide ? 3 : 1
            columnSpacing: landing.gap
            rowSpacing: landing.gap

            FeatureCard {
                id: typed
                width: points.cardWidth
                height: landing.wide ? points.tallest : contentHeight
                mark: "01"
                title: t`TypeScript first`
                body: t`Write app logic in TypeScript and catch mistakes with <code>ljos check</code>. Use Rust where you need it. Already have QML? <a href="/language/porting-from-qt/">Bring it along</a>.`
                onFollowed: (link) => landing.follow(link)
            }
            FeatureCard {
                id: observed
                width: points.cardWidth
                height: landing.wide ? points.tallest : contentHeight
                mark: "02"
                title: t`See inside a running app`
                body: t`Open the Observer to see every part of your app, where its values come from, and what’s using time and memory. Your agent gets the same view.`
                onFollowed: (link) => landing.follow(link)
            }
            FeatureCard {
                id: stable
                width: points.cardWidth
                height: landing.wide ? points.tallest : contentHeight
                mark: "03"
                title: t`Fast, and quiet when idle`
                body: t`Our benchmark mail app shows its first frame in under 90 ms, uses under 24 MiB of private memory, and takes 0 % CPU when idle.<br><br>These are <a href="https://github.com/hal-c2/ljos-ui/blob/main/docs/BENCHMARKS.md">native numbers</a> from Linux on 10\u00a0Nov\u00a02026. They don’t measure this web page.`
                onFollowed: (link) => landing.follow(link)
            }
        }
    }

    // A demo of what the engine draws, the words on the left again.
    Rise {
        Capability {
            id: seeItRun
            wide: landing.wide
            eyebrow: t`Live in the page`
            title: t`See it run`
            body: t`A smartwatch's software beside the watch in 3D. Once it runs, swipe or tap the face, and drag the watch to turn it. The <a href="/demos/">live demos</a> have more, and the <a href="/demos/watch/">watch's own page</a> lets you edit every file. Where the browser lacks the WebAssembly or WebGL 2 it needs, a picture stands in.`
            onFollowed: (link) => landing.follow(link)

            // The showcase mounts here: Kestrel, the watch of the demos
            // page, made once the reader presses its Run, its picture
            // standing until then, and for good where the browser cannot
            // run it. Its pictures are the watch page's (Demos/pro.json),
            // the compact ones where the watch stacks on a narrow page.
            Slot {
                name: "showcase"
                delegate: Component {
                    DemoFrame {
                        width: seeItRun.exampleWidth
                        scroller: landing.scroller
                        needs: "webgl2"
                        aspect: landing.wide ? 640 / 1120 : 992 / 640
                        picture: landing.wide ? "/pictures/demo-watch.webp" : "/pictures/demo-watch-compact.webp"
                        pictureDark: landing.wide ? "/pictures/demo-watch-dark.webp" : "/pictures/demo-watch-compact-dark.webp"
                        what: t`the watch`
                        description: t`A round smartwatch face with neon rings beside the same watch in 3D, in its case on a linked band, its screen's ring glowing.`
                        source: Later.watch
                    }
                }
            }
        }
    }

    // How the project means to work together: the headline on the
    // grid's first five columns, the words on the other seven.
    // It stands in a panel of its own, on the hero's wash, so the words
    // read as the project's own statement and not as one more section.
    Rise {
        Rectangle {
            id: togetherPanel

            readonly property int pad: landing.wide ? Theme.xxl : Theme.l

            width: parent.width
            height: together.height + 2 * pad
            radius: Theme.radiusLarge
            fill: Theme.surface
            border.color: Theme.divider
            border.width: 1
            clip: true
            gradient: Gradient {
                orientation: Gradient.Horizontal
                GradientStop { position: 0; color: Theme.washStart }
                GradientStop { position: 0.55; color: Theme.surface }
            }

            Item {
                id: together

                readonly property real column: (width - (Theme.columns - 1) * Theme.columnGap) / Theme.columns
                readonly property int wordsX: landing.wide ? Math.round(5 * column + 5 * Theme.columnGap) : 0

                x: togetherPanel.pad
                y: togetherPanel.pad
                width: parent.width - 2 * togetherPanel.pad
                height: landing.wide ? Math.max(togetherHeading.height, togetherWords.implicitHeight) : togetherHeading.height + Theme.m + togetherWords.implicitHeight

                Heading {
                    id: togetherHeading
                    width: landing.wide ? together.wordsX - Theme.columnGap : parent.width
                    level: "display"
                    wide: landing.wide
                    text: t`Built together`
                }
                Text {
                    id: togetherWords
                    x: together.wordsX
                    y: landing.wide ? Theme.xs : togetherHeading.height + Theme.m
                    width: Math.min(parent.width - x, Theme.measure)
                    format: Text.RichText
                    color: Theme.textMuted
                    linkColor: Theme.link
                    font.family: Theme.sans
                    font.size: Theme.bodySize
                    lineHeightMode: Text.FixedHeight
                    lineHeight: Theme.bodyLine
                    wrap: Text.Wrap
                    text: t`Ljós strives to follow the <a href="https://community-software.org/">Community Software</a> principles: we build it together, as peers, in the open.<br><br>Everyone is welcome.<br>We are peers.<br>Every contribution counts.<br>Influence grows from participation.<br>Be kind to people, rigorous with ideas.<br>“No” and “not yet” are valid answers.<br>Look after yourself and each other.<br><br>Code is one way to help. Testing, docs, design, translation and accessibility reviews count as much, and questions from newcomers are welcome.`
                    onLinkActivated: (link) => landing.follow(link)
                }
            }
        }
    }

    // Where to read next: four cards abreast where there is room.
    Rise {
        Column {
            width: parent.width
            spacing: Theme.l

            Heading {
                width: parent.width
                level: "display"
                wide: landing.wide
                text: t`Start reading`
            }
            Grid {
                id: reading

                columns: landing.width >= 1100 ? 4 : landing.wide ? 2 : 1
                readonly property int cardWidth: Math.floor((landing.width - (columns - 1) * landing.gap) / columns)
                readonly property real tallestTop: columns === 4 ? Math.max(map.contentHeight, first.contentHeight, demosCard.contentHeight, goals.contentHeight) : Math.max(map.contentHeight, first.contentHeight)
                readonly property real tallestBottom: columns === 4 ? tallestTop : Math.max(demosCard.contentHeight, goals.contentHeight)

                width: parent.width
                columnSpacing: landing.gap
                rowSpacing: landing.gap

                FeatureCard {
                    id: map
                    width: reading.cardWidth
                    height: reading.columns > 1 ? reading.tallestTop : contentHeight
                    title: t`What is Ljós?`
                    href: "/start/"
                    body: t`The big picture, in plain words.`
                    onFollowed: (link) => landing.follow(link)
                }
                FeatureCard {
                    id: first
                    width: reading.cardWidth
                    height: reading.columns > 1 ? reading.tallestTop : contentHeight
                    title: t`Your first app`
                    href: "/start/first-app/"
                    body: t`Open a window, then change it while it runs.`
                    onFollowed: (link) => landing.follow(link)
                }
                FeatureCard {
                    id: demosCard
                    width: reading.cardWidth
                    height: reading.columns > 1 ? reading.tallestBottom : contentHeight
                    title: t`Live demos`
                    href: "/demos/"
                    body: t`Try Ljós in your browser, with nothing to install.`
                    onFollowed: (link) => landing.follow(link)
                }
                FeatureCard {
                    id: goals
                    width: reading.cardWidth
                    height: reading.columns > 1 ? reading.tallestBottom : contentHeight
                    title: t`Goals and principles`
                    href: "/quality/principles/"
                    body: t`What we care about, and what we leave out on purpose.`
                    onFollowed: (link) => landing.follow(link)
                }
            }
        }
    }
}
