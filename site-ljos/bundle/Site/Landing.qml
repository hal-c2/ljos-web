// Ljós's Core before QtQuick: only its t`` is wanted here, and any name
// both have stays QtQuick's, the later import.
import Ljos.Core
import QtQuick
import Ljos.Blocks
import Site
import Demos
import "../Demos/later.js" as Later
import "../nav.js" as Nav

// The front page. It opens with typed, observable and drivable apps,
// proves shell replacement live with the Pantry, then covers
// TypeScript first, the Observer and MCP, stability and memory at rest,
// the 3D showcase, community principles and where to read next.
// Existing QML is named once, as the way in; the porting page tells
// that story. The words are the page's; how they stand (the hero beside
// its live app, the sections on the grid, rising in as they are first
// seen) is Site's, which each shell dresses.
Column {
    id: landing

    // The flickable the page scrolls in, for the demos to know when
    // they are on screen; and whether the window is a wide one.
    property var scroller: null
    property bool wide: true
    // Prose reads at a measure, whatever the page's width.
    readonly property int prose: Math.min(width, Theme.measure)
    readonly property int textWidth: width

    width: parent ? parent.width : 680
    // Sections stand well apart: each is one thing, said and shown.
    spacing: wide ? 2 * Theme.xxxl : Theme.xxxl + Theme.m
    // The grid's column and gap, for the sections that lay out on it.
    readonly property int gap: wide ? Theme.columnGap : Theme.compactColumnGap

    function follow(link) {
        Nav.go(link);
    }

    // What Ljós is, and where to go first, beside a live app.
    Hero {
        width: parent.width
        wide: landing.wide
        title: t`Ljós — malleable software, everywhere`
        subtitle: t`Ljós is a UI toolkit for typed apps you can see inside and drive while they run: strict TypeScript under declarative pages, open to the Observer and to agents over MCP, with a shell people reshape as it runs.`
        onFollowed: (link) => landing.follow(link)

        LinkButton {
            primary: true
            label: t`What is Ljós?`
            href: "/start/"
        }
        // The second way in has its outline; the third is a link.
        LinkButton {
            label: t`Your first app`
            href: "/start/first-app/"
        }
        LinkButton {
            quiet: true
            label: t`See the demos`
            href: "/demos/"
        }
    }

    // Your own shell: the point, said, shown in code, and run.
    Rise {
        Capability {
            id: ownShell
            wide: landing.wide
            eyebrow: t`Malleable`
            title: t`Your own shell`
            body: t`A Ljós app keeps its own data and logic, while its interface is a shell: menus, sidebars and panels filled by blocks placed into named <code>Slot</code>s. Ship a default shell, and let people or their agents replace it with a <code>shell.qml</code> of their own through <code>ShellLoader</code> from <code>Ljos.Blocks</code>.`
            onFollowed: (link) => landing.follow(link)
            after: Text {
                width: ownShell.wordsWidth
                textFormat: Text.RichText
                color: Theme.textMuted
                linkColor: Theme.link
                font.family: Theme.sans
                font.pixelSize: Theme.bodySize
                lineHeightMode: Text.FixedHeight
                lineHeight: Theme.bodyLine
                wrapMode: Text.Wrap
                text: t`When the shell changes, the app keeps running and keeps its state. The same compiler and lints check each edit before it loads; if an edit fails to compile, <code>ShellLoader</code> keeps the last shell that compiled and <code>reload()</code> says what broke and where. A shell that cannot run at all gives way to the app's own, with the reason in <code>error</code>.`
                onLinkActivated: (link) => landing.follow(link)
            }

            CodeBlock {
                width: ownShell.exampleWidth
                scroller: landing.scroller
                lang: "qml"
                code: "import Ljos.Blocks\n\nShellLoader {\n    source: \"shell.qml\"       // the user's own, where the app looks\n    fallback: \"AppShell.qml\"  // the app's, standing when theirs does not\n}\n"
                rich: "import Ljos.Blocks\n\nShellLoader {\n    source: \"shell.qml\"       // the user's own, where the app looks\n    fallback: \"AppShell.qml\"  // the app's, standing when theirs does not\n}\n"
            }
            // What to do with the playground under the section.
            Text {
                width: ownShell.exampleWidth
                textFormat: Text.RichText
                color: Theme.text
                linkColor: Theme.link
                font.family: Theme.sans
                font.pixelSize: Theme.bodySize
                lineHeightMode: Text.FixedHeight
                lineHeight: Theme.bodyLine
                wrapMode: Text.Wrap
                topPadding: Theme.m
                text: t`<b>Try rewriting this app's shell live.</b> Add an item to the basket below, then edit the <code>Shell.qml</code> source under it: move a <code>Slot</code> and the running app rearranges while the basket keeps its items. Introduce a typo and the last shell that compiled keeps running, with the compiler error shown beside the editor; fix it, or press Reset to go back to the app's own shell.`
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
                body: t`Write logic in strict TypeScript modules, with declarative pages over them. Handlers, functions and bindings are type-checked in Rust before anything runs, while heavy logic and native models can stay in Rust. Existing QML runs as the way in — <a href="/language/porting-from-qt/">bringing an app along</a> covers <code>ljos check --port</code> and <code>ljos migrate</code>.`
                onFollowed: (link) => landing.follow(link)
            }
            FeatureCard {
                id: observed
                width: points.cardWidth
                height: landing.wide ? points.tallest : contentHeight
                mark: "02"
                title: t`See inside and drive a running app`
                body: t`Start a native build with <code>ljos run --mcp</code> and open the Observer with <code>ljos observe</code> to inspect live objects, properties, bindings, memory, frames and wakes. An agent gets the same view over <a href="/start/mcp/">MCP</a>, clicking buttons, typing text and reading results through the same input path a person uses.`
                onFollowed: (link) => landing.follow(link)
            }
            FeatureCard {
                id: stable
                width: points.cardWidth
                height: landing.wide ? points.tallest : contentHeight
                mark: "03"
                title: t`Stable, light, and 0 % CPU at rest`
                body: t`A failing part restarts or shows a fallback instead of closing the window, and an app at rest uses 0 % CPU. In the project's own benchmark (2026-11-10, a mail window of 1 000 rows, native builds on Linux, not this web page), Ljós drew its first frame in 59–88 ms against qml6's 558–820 ms, held 23 MiB of private memory against 130 MiB, and scrolled at the same frame rate on a third of the CPU. One engine targets Linux, macOS, Windows, Android, iOS and the web.`
                onFollowed: (link) => landing.follow(link)
            }
        }
    }

    // A demo of what the engine draws, the example on the left this time.
    Rise {
        Capability {
            id: seeItRun
            wide: landing.wide
            flip: true
            eyebrow: t`Live in the page`
            title: t`See it run`
            body: t`Once this 3D scene runs, drag to orbit it, and switch between light and dark themes in the header to watch it follow. The <a href="/demos/">live demos</a> add a car cockpit and a smartwatch whose files you can edit, plus a shader effect, a bird field guide and a motion study — each a complete Ljós app that keeps a picture and its description where the browser lacks the WebAssembly or WebGL 2 it needs.`
            onFollowed: (link) => landing.follow(link)

            // The showcase mounts here: a 3D scene to orbit, made once the
            // reader presses its Run, its picture standing until then — and
            // for good where the browser cannot run it.
            Slot {
                name: "showcase"
                delegate: Component {
                    DemoFrame {
                        width: seeItRun.exampleWidth
                        scroller: landing.scroller
                        needs: "webgl2"
                        picture: "/pictures/demo-orbit.webp"
                        pictureDark: "/pictures/demo-orbit-dark.webp"
                        what: t`the 3D demo`
                        description: t`A lit 3D scene of shapes on a floor, which a drag turns.`
                        source: Later.orbit
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
            color: Theme.surface
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
                    textFormat: Text.RichText
                    color: Theme.textMuted
                    linkColor: Theme.link
                    font.family: Theme.sans
                    font.pixelSize: Theme.bodySize
                    lineHeightMode: Text.FixedHeight
                    lineHeight: Theme.bodyLine
                    wrapMode: Text.Wrap
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
                    body: t`An overview of the toolkit and a map of the docs.`
                    onFollowed: (link) => landing.follow(link)
                }
                FeatureCard {
                    id: first
                    width: reading.cardWidth
                    height: reading.columns > 1 ? reading.tallestTop : contentHeight
                    title: t`Your first app`
                    href: "/start/first-app/"
                    body: t`Write a file, open a window, and watch live edits apply without losing state.`
                    onFollowed: (link) => landing.follow(link)
                }
                FeatureCard {
                    id: demosCard
                    width: reading.cardWidth
                    height: reading.columns > 1 ? reading.tallestBottom : contentHeight
                    title: t`Live demos`
                    href: "/demos/"
                    body: t`Run every embedded app in the browser, and edit the shell and multi-file demos.`
                    onFollowed: (link) => landing.follow(link)
                }
                FeatureCard {
                    id: goals
                    width: reading.cardWidth
                    height: reading.columns > 1 ? reading.tallestBottom : contentHeight
                    title: t`Goals and principles`
                    href: "/quality/principles/"
                    body: t`What Ljós builds, what it leaves out, and why agents are first-class users.`
                    onFollowed: (link) => landing.follow(link)
                }
            }
        }
    }
}
