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
// that story.
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
    spacing: 0

    function follow(link) {
        Nav.go(link);
    }

    // What Ljós is, and where to go first.
    Column {
        width: parent.width
        topPadding: landing.wide ? Theme.xxl : Theme.l
        bottomPadding: landing.wide ? Theme.xxxl : Theme.xxl
        spacing: Theme.l

        Text {
            text: t`Typed, malleable UI`
            color: Theme.link
            font.family: Theme.sans
            font.pixelSize: Theme.captionSize + 1
            font.weight: Font.DemiBold
            font.letterSpacing: 0.5
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.captionLine
        }
        Text {
            width: Math.min(parent.width, 880)
            text: t`Ljós — malleable software, everywhere`
            color: Theme.text
            font.family: Theme.sans
            font.pixelSize: landing.wide ? Theme.heroSize : Theme.compactHeroSize
            font.weight: Font.Bold
            font.letterSpacing: landing.wide ? -1 : -0.5
            lineHeightMode: Text.FixedHeight
            lineHeight: landing.wide ? Theme.heroLine : Theme.compactHeroLine
            wrapMode: Text.Wrap
            readonly property int headingLevel: 1
            Accessible.role: Accessible.Heading
        }
        Text {
            width: landing.prose
            textFormat: Text.RichText
            color: Theme.textMuted
            linkColor: Theme.link
            font.family: Theme.sans
            font.pixelSize: landing.wide ? Theme.subtitleSize + 1 : Theme.subtitleSize - 1
            lineHeightMode: Text.FixedHeight
            lineHeight: landing.wide ? Theme.subtitleLine + 2 : Theme.subtitleLine - 2
            wrapMode: Text.Wrap
            text: t`Ljós is a UI toolkit for typed apps you can see inside and drive while they run: strict TypeScript under declarative pages, open to the Observer and to agents over MCP, with a shell people reshape as it runs.`
            onLinkActivated: (link) => landing.follow(link)
        }
        Flow {
            width: parent.width
            spacing: Theme.s

            LinkButton {
                primary: true
                label: t`What is Ljós?`
                href: "/start/"
            }
            LinkButton {
                label: t`Your first app`
                href: "/start/first-app/"
            }
            LinkButton {
                label: t`See the demos`
                href: "/demos/"
            }
        }
    }

    // Your own shell: the point, said, shown in code, and run.
    Column {
        width: parent.width
        spacing: Theme.m
        bottomPadding: Theme.xxxl

        Text {
            width: parent.width
            text: t`Your own shell`
            color: Theme.text
            font.family: Theme.sans
            font.pixelSize: landing.wide ? Theme.headlineSize + 4 : Theme.headlineSize - 2
            font.weight: Font.Bold
            lineHeightMode: Text.FixedHeight
            lineHeight: landing.wide ? Theme.headlineLine + 4 : Theme.headlineLine - 4
            wrapMode: Text.Wrap
            readonly property int headingLevel: 2
            Accessible.role: Accessible.Heading
        }
        Text {
            width: landing.prose
            textFormat: Text.RichText
            color: Theme.text
            linkColor: Theme.link
            font.family: Theme.sans
            font.pixelSize: Theme.bodySize + 1
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.bodyLine + 4
            wrapMode: Text.Wrap
            text: t`A Ljós app keeps its own data and logic, while its interface is a shell: menus, sidebars and panels filled by blocks placed into named <code>Slot</code>s. Ship a default shell, and let people or their agents replace it with a <code>shell.qml</code> of their own through <code>ShellLoader</code> from <code>Ljos.Blocks</code>.`
            onLinkActivated: (link) => landing.follow(link)
        }
        Text {
            width: landing.prose
            textFormat: Text.RichText
            color: Theme.text
            linkColor: Theme.link
            font.family: Theme.sans
            font.pixelSize: Theme.bodySize + 1
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.bodyLine + 4
            wrapMode: Text.Wrap
            text: t`When the shell changes, the app keeps running and keeps its state. The same compiler and lints check each edit before it loads; if an edit fails to compile, <code>ShellLoader</code> falls back to the app's own shell and reports what broke and where in <code>error</code>.`
            onLinkActivated: (link) => landing.follow(link)
        }
        CodeBlock {
            width: landing.prose
            lang: "qml"
            code: "import Ljos.Blocks\n\nShellLoader {\n    source: \"shell.qml\"       // the user's own, where the app looks\n    fallback: \"AppShell.qml\"  // the app's, standing when theirs does not\n}\n"
            rich: "import Ljos.Blocks\n\nShellLoader {\n    source: \"shell.qml\"       // the user's own, where the app looks\n    fallback: \"AppShell.qml\"  // the app's, standing when theirs does not\n}\n"
        }
        Item {
            width: 1
            height: Theme.xs
        }
        // The flagship malleable demo mounts into this slot: a small
        // app whose shell the visitor rewrites on the page, its state
        // kept, a broken edit falling back with the error shown. It is
        // the page's point, so it is made with the page.
        Slot {
            name: "showcase-shell"
            delegate: Component {
                Column {
                    width: landing.prose
                    spacing: Theme.s

                    Text {
                        width: Math.min(parent.width, Theme.measure)
                        textFormat: Text.RichText
                        color: Theme.text
                        linkColor: Theme.link
                        font.family: Theme.sans
                        font.pixelSize: Theme.bodySize
                        lineHeightMode: Text.FixedHeight
                        lineHeight: Theme.bodyLine
                        wrapMode: Text.Wrap
                        text: t`<b>Try rewriting this app's shell live.</b> Add an item to the basket below, then edit the <code>Shell.qml</code> source under it: move a <code>Slot</code> and the running app rearranges while the basket keeps its items. Introduce a typo and the app falls back to its built-in shell with the compiler error shown, then fix it or press Reset to return.`
                    }
                    PantryDemo {
                        width: parent.width
                    }
                }
            }
        }
    }

    // The rest of what Ljós is, a card each.
    Grid {
        id: points

        readonly property int cardWidth: landing.wide ? Math.floor((landing.width - 2 * Theme.m) / 3) : landing.width
        readonly property real tallest: Math.max(typed.contentHeight, observed.contentHeight, stable.contentHeight)

        width: parent.width
        columns: landing.wide ? 3 : 1
        columnSpacing: Theme.m
        rowSpacing: Theme.m

        FeatureCard {
            id: typed
            width: points.cardWidth
            height: landing.wide ? points.tallest : contentHeight
            title: t`TypeScript first`
            body: t`Write logic in strict TypeScript modules, with declarative pages over them. Handlers, functions and bindings are type-checked in Rust before anything runs, while heavy logic and native models can stay in Rust. Existing QML runs as the way in — <a href="/language/porting-from-qt/">bringing an app along</a> covers <code>ljos check --port</code> and <code>ljos migrate</code>.`
            onFollowed: (link) => landing.follow(link)
        }
        FeatureCard {
            id: observed
            width: points.cardWidth
            height: landing.wide ? points.tallest : contentHeight
            title: t`See inside and drive a running app`
            body: t`Start a native build with <code>ljos run --mcp</code> and open the Observer with <code>ljos observe</code> to inspect live objects, properties, bindings, memory, frames and wakes. An agent gets the same view over <a href="/start/mcp/">MCP</a>, clicking buttons, typing text and reading results through the same input path a person uses.`
            onFollowed: (link) => landing.follow(link)
        }
        FeatureCard {
            id: stable
            width: points.cardWidth
            height: landing.wide ? points.tallest : contentHeight
            title: t`Stable, light, and 0 % CPU at rest`
            body: t`A failing part restarts or shows a fallback instead of closing the window, and an app at rest uses 0 % CPU. In the project's own benchmark (2026-11-10, a mail window of 1 000 rows, native builds on Linux, not this web page), Ljós drew its first frame in 59–88 ms against qml6's 558–820 ms, held 23 MiB of private memory against 130 MiB, and scrolled at the same frame rate on a third of the CPU. One engine targets Linux, macOS, Windows, Android, iOS and the web.`
            onFollowed: (link) => landing.follow(link)
        }
    }

    // A demo of what the engine draws.
    Column {
        width: parent.width
        topPadding: Theme.xxxl
        spacing: Theme.m

        Text {
            width: parent.width
            text: t`See it run`
            color: Theme.text
            font.family: Theme.sans
            font.pixelSize: landing.wide ? Theme.headlineSize + 4 : Theme.headlineSize - 2
            font.weight: Font.Bold
            lineHeightMode: Text.FixedHeight
            lineHeight: landing.wide ? Theme.headlineLine + 4 : Theme.headlineLine - 4
            wrapMode: Text.Wrap
            readonly property int headingLevel: 2
            Accessible.role: Accessible.Heading
        }
        // The showcase mounts here: a 3D scene to orbit, made once the
        // reader presses its Run, its picture standing until then — and for
        // good where the browser cannot run it.
        Slot {
            name: "showcase"
            delegate: Component {
                Column {
                    width: landing.textWidth
                    spacing: Theme.s

                    DemoFrame {
                        width: parent.width
                        scroller: landing.scroller
                        needs: "webgl2"
                        picture: "/pictures/demo-orbit.webp"
                        pictureDark: "/pictures/demo-orbit-dark.webp"
                        what: t`the 3D demo`
                        description: t`A lit 3D scene of shapes on a floor, which a drag turns.`
                        source: Later.orbit
                    }
                    Text {
                        width: Math.min(parent.width, Theme.measure)
                        textFormat: Text.RichText
                        color: Theme.textMuted
                        linkColor: Theme.link
                        font.family: Theme.sans
                        font.pixelSize: Theme.bodySize - 1
                        lineHeightMode: Text.FixedHeight
                        lineHeight: Theme.bodyLine
                        wrapMode: Text.Wrap
                        text: Nav.linked(Content.base, t`Press Run to start this 3D scene, drag to orbit it, and switch between light and dark themes in the header to watch it follow. The <a href="/demos/">live demos</a> add a car cockpit and a smartwatch whose files you can edit, plus a shader effect, a bird field guide and a motion study — each a complete Ljós app that falls back to a picture and its description where WebAssembly or WebGL 2 is unavailable.`)
                        onLinkActivated: (link) => landing.follow(link)
                    }
                }
            }
        }
    }

    // How the project means to work together.
    Column {
        width: parent.width
        topPadding: Theme.xxxl
        spacing: Theme.m

        Text {
            width: parent.width
            text: t`Built together`
            color: Theme.text
            font.family: Theme.sans
            font.pixelSize: landing.wide ? Theme.headlineSize + 4 : Theme.headlineSize - 2
            font.weight: Font.Bold
            lineHeightMode: Text.FixedHeight
            lineHeight: landing.wide ? Theme.headlineLine + 4 : Theme.headlineLine - 4
            wrapMode: Text.Wrap
            readonly property int headingLevel: 2
            Accessible.role: Accessible.Heading
        }
        Text {
            width: Math.min(parent.width, Theme.measure)
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

    // Where to read next.
    Column {
        width: parent.width
        topPadding: Theme.xxxl
        spacing: Theme.m

        Text {
            width: parent.width
            text: t`Start reading`
            color: Theme.text
            font.family: Theme.sans
            font.pixelSize: landing.wide ? Theme.headlineSize + 4 : Theme.headlineSize - 2
            font.weight: Font.Bold
            lineHeightMode: Text.FixedHeight
            lineHeight: landing.wide ? Theme.headlineLine + 4 : Theme.headlineLine - 4
            wrapMode: Text.Wrap
            readonly property int headingLevel: 2
            Accessible.role: Accessible.Heading
        }
        Grid {
            id: reading

            readonly property int cardWidth: landing.wide ? Math.floor((landing.width - Theme.m) / 2) : landing.width
            readonly property real tallestTop: Math.max(map.contentHeight, first.contentHeight)
            readonly property real tallestBottom: Math.max(demosCard.contentHeight, goals.contentHeight)

            width: parent.width
            columns: landing.wide ? 2 : 1
            columnSpacing: Theme.m
            rowSpacing: Theme.m

            FeatureCard {
                id: map
                width: reading.cardWidth
                height: landing.wide ? reading.tallestTop : contentHeight
                title: t`What is Ljós?`
                href: "/start/"
                body: t`An overview of the toolkit and a map of the docs.`
                onFollowed: (link) => landing.follow(link)
            }
            FeatureCard {
                id: first
                width: reading.cardWidth
                height: landing.wide ? reading.tallestTop : contentHeight
                title: t`Your first app`
                href: "/start/first-app/"
                body: t`Write a file, open a window, and watch live edits apply without losing state.`
                onFollowed: (link) => landing.follow(link)
            }
            FeatureCard {
                id: demosCard
                width: reading.cardWidth
                height: landing.wide ? reading.tallestBottom : contentHeight
                title: t`Live demos`
                href: "/demos/"
                body: t`Run every embedded app in the browser, and edit the shell and multi-file demos.`
                onFollowed: (link) => landing.follow(link)
            }
            FeatureCard {
                id: goals
                width: reading.cardWidth
                height: landing.wide ? reading.tallestBottom : contentHeight
                title: t`Goals and principles`
                href: "/quality/principles/"
                body: t`What Ljós builds, what it leaves out, and why agents are first-class users.`
                onFollowed: (link) => landing.follow(link)
            }
        }
    }
}
