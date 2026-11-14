import QtQuick
import Ljos.Blocks
import Site
import Demos
import "../nav.js" as Nav

// The front page. It leads with what malleable means here: the
// person using an app replaces its interface with a shell of their
// own, and the app's shell — with what broke, and where — is what
// stands when theirs does not work. Then, in order: typed
// TypeScript, a running app you can observe and drive, and
// stability at rest. Existing QML is a way in, named once, in
// passing; the porting page is where that story is told.
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
            text: "Malleable software"
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
            text: "Ljós — malleable software, everywhere"
            color: Theme.text
            font.family: Theme.sans
            font.pixelSize: landing.wide ? Theme.heroSize : Theme.compactHeroSize
            font.weight: Font.Bold
            font.letterSpacing: landing.wide ? -1 : -0.5
            lineHeightMode: Text.FixedHeight
            lineHeight: landing.wide ? Theme.heroLine : Theme.compactHeroLine
            wrapMode: Text.Wrap
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
            text: "A Rust UI toolkit for apps that the people who use them — and their agents — can reshape while they run. Interfaces are declarative, scripts are typed TypeScript, and every part of a running app can be observed and driven."
            onLinkActivated: (link) => landing.follow(link)
        }
        Flow {
            width: parent.width
            spacing: Theme.s

            LinkButton {
                primary: true
                label: "What is Ljós?"
                href: "/start/"
            }
            LinkButton {
                label: "Your first app"
                href: "/start/first-app/"
            }
            LinkButton {
                label: "See the demos"
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
            text: "Your own shell"
            color: Theme.text
            font.family: Theme.sans
            font.pixelSize: landing.wide ? Theme.headlineSize + 4 : Theme.headlineSize - 2
            font.weight: Font.Bold
            lineHeightMode: Text.FixedHeight
            lineHeight: landing.wide ? Theme.headlineLine + 4 : Theme.headlineLine - 4
            wrapMode: Text.Wrap
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
            text: "Most programs are finished before you meet them. A Ljós app does the work and keeps the state; its interface is a shell, built from blocks the app and its plugins offer into named <code>Slot</code>s. Ship your own shell, and let each person replace it with a <code>shell.qml</code> of theirs: <code>ShellLoader</code> — <code>import Ljos.Blocks</code> — shows theirs in your shell's place."
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
            text: "The state stays and the work goes on. A broken edit falls back to the app's shell, with <code>error</code> saying what broke and where, so an experiment never bricks the app. The compiler and the lints ship in the app, so the edit is checked the way your own code is: the interface belongs to whoever is looking at it."
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
                        text: "<b>Rewrite this app's shell.</b> A small app whose shell you edit below, on the page. Move where a <code>Slot</code> contribution lands and it moves; break the shell and the app's own shell stands in its place, with the error shown; the app's data and state survive both."
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
            title: "TypeScript first"
            body: "Interfaces are declarative; scripts are typed TypeScript, checked before anything runs. Handlers, functions and bindings carry their types, and the compiler says so where they do not add up. Logic, models and native types can stay in Rust, driven from the interface like anything else. Existing QML runs as a way in — <a href=\"/language/porting-from-qt/\">bringing an app along</a> has its own page."
            onFollowed: (link) => landing.follow(link)
        }
        FeatureCard {
            id: observed
            width: points.cardWidth
            height: landing.wide ? points.tallest : contentHeight
            title: "Observe and drive a running app"
            body: "Every part of a running app can be observed and driven. <code>ljos observe</code> opens on its live objects, properties, bindings, frames and wakes, and sends real input; a coding agent gets the same view over <a href=\"/start/mcp/\">MCP</a>. What an agent can reshape, it can also check."
            onFollowed: (link) => landing.follow(link)
        }
        FeatureCard {
            id: stable
            width: points.cardWidth
            height: landing.wide ? points.tallest : contentHeight
            title: "Stable, and still at rest"
            body: "Work runs when input, a timer, an animation or a message asks for it; nothing polls, and an app at rest uses 0 % CPU. A fault restarts the part of the interface that caused it, not the window. The same engine renders on Linux, macOS, Windows, Android, iOS — and the web, where this site is itself a Ljós page."
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
            text: "See it run"
            color: Theme.text
            font.family: Theme.sans
            font.pixelSize: landing.wide ? Theme.headlineSize + 4 : Theme.headlineSize - 2
            font.weight: Font.Bold
            lineHeightMode: Text.FixedHeight
            lineHeight: landing.wide ? Theme.headlineLine + 4 : Theme.headlineLine - 4
            wrapMode: Text.Wrap
            Accessible.role: Accessible.Heading
        }
        // The showcase mounts here: a 3D scene to orbit, made once the
        // reader nears it, its picture standing until then — and for
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
                        needs: "webgpu"
                        picture: "/pictures/demo-orbit.webp"
                        description: "A lit 3D scene of shapes on a floor, which a drag turns."
                        demo: Component {
                            Orbit {}
                        }
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
                        text: "The <a href=\"/demos/\">live demos</a> run in this page: a shell you rewrite, a 3D scene you can orbit, a shader effect, a whole app, and motion — each a complete Ljós app, each with a picture and its words where wasm or WebGPU is missing."
                        onLinkActivated: (link) => landing.follow(link)
                    }
                }
            }
        }
    }

    // Where to read next.
    Column {
        width: parent.width
        topPadding: Theme.xxxl
        spacing: Theme.m

        Text {
            width: parent.width
            text: "Start reading"
            color: Theme.text
            font.family: Theme.sans
            font.pixelSize: landing.wide ? Theme.headlineSize + 4 : Theme.headlineSize - 2
            font.weight: Font.Bold
            lineHeightMode: Text.FixedHeight
            lineHeight: landing.wide ? Theme.headlineLine + 4 : Theme.headlineLine - 4
            wrapMode: Text.Wrap
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
                title: "What is Ljós?"
                href: "/start/"
                body: "The map of these docs."
                onFollowed: (link) => landing.follow(link)
            }
            FeatureCard {
                id: first
                width: reading.cardWidth
                height: landing.wide ? reading.tallestTop : contentHeight
                title: "Your first app"
                href: "/start/first-app/"
                body: "A file, a window, live edits."
                onFollowed: (link) => landing.follow(link)
            }
            FeatureCard {
                id: demosCard
                width: reading.cardWidth
                height: landing.wide ? reading.tallestBottom : contentHeight
                title: "Live demos"
                href: "/demos/"
                body: "Every embedded example in one place."
                onFollowed: (link) => landing.follow(link)
            }
            FeatureCard {
                id: goals
                width: reading.cardWidth
                height: landing.wide ? reading.tallestBottom : contentHeight
                title: "Goals and principles"
                href: "/quality/principles/"
                body: "What Ljós does, what it leaves out, and why."
                onFollowed: (link) => landing.follow(link)
            }
        }
    }
}
