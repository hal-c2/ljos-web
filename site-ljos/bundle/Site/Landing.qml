import QtQuick
import Ljos.Blocks
import Site
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

    property int textWidth: width

    width: parent ? parent.width : 680
    spacing: 18

    function follow(link) {
        Nav.go(link);
    }

    Text {
        width: parent.width
        text: "Ljós — malleable software, everywhere"
        color: Theme.ink
        font.family: Theme.serif
        font.pixelSize: 40
        font.bold: true
        wrapMode: Text.Wrap
    }
    Text {
        width: parent.width
        textFormat: Text.RichText
        color: Theme.ink
        font.family: Theme.sans
        font.pixelSize: 17
        wrapMode: Text.Wrap
        text: "Ljós is a Rust UI toolkit for malleable software: apps that the people who use them — and their agents — can reshape while they run. An app does the work and keeps the state; its interface is a shell. Ship your own shell, and let each person replace it with a <code>shell.qml</code> of theirs: a <code>ShellLoader</code> shows theirs in place of yours, the app and its plugins offer their pieces into named <code>Slot</code>s for that shell to place, and when an edit does not work, yours is what stands, with what broke and where said out loud."
        onLinkActivated: (link) => landing.follow(link)
    }
    Row {
        spacing: 12

        Rectangle {
            width: startWords.implicitWidth + 28
            height: 40
            color: Theme.accent
            activeFocusOnTab: true
            Accessible.role: Accessible.Link
            Accessible.name: "What is Ljós?"
            Accessible.onPressAction: () => Nav.go("/start/")
            Keys.onPressed: (event) => {
                if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                    Nav.go("/start/");
                    event.accepted = true;
                }
            }

            Text {
                id: startWords
                anchors.centerIn: parent
                text: "What is Ljós?"
                color: Theme.onAccent
                font.family: Theme.sans
                font.pixelSize: 15
                font.bold: true
            }
            MouseArea {
                anchors.fill: parent
                Accessible.ignored: true
                cursorShape: Qt.PointingHandCursor
                onClicked: Nav.go("/start/")
            }
        }
        Rectangle {
            width: firstWords.implicitWidth + 28
            height: 40
            color: Theme.bg
            border.color: Theme.accent
            border.width: 1
            activeFocusOnTab: true
            Accessible.role: Accessible.Link
            Accessible.name: "Your first app"
            Accessible.onPressAction: () => Nav.go("/start/first-app/")
            Keys.onPressed: (event) => {
                if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                    Nav.go("/start/first-app/");
                    event.accepted = true;
                }
            }

            Text {
                id: firstWords
                anchors.centerIn: parent
                text: "Your first app"
                color: Theme.accent
                font.family: Theme.sans
                font.pixelSize: 15
                font.bold: true
            }
            MouseArea {
                anchors.fill: parent
                Accessible.ignored: true
                cursorShape: Qt.PointingHandCursor
                onClicked: Nav.go("/start/first-app/")
            }
        }
    }

    Text {
        width: parent.width
        text: "Your own shell"
        color: Theme.ink
        font.family: Theme.serif
        font.pixelSize: 26
        font.bold: true
        wrapMode: Text.Wrap
    }
    Text {
        width: parent.width
        textFormat: Text.RichText
        color: Theme.ink
        font.family: Theme.sans
        font.pixelSize: 15
        wrapMode: Text.Wrap
        text: "Most programs are finished before you meet them. A Ljós app is built from blocks: the pieces of its interface, contributed into named <code>Slot</code>s. A shell lays those slots out. Yours ships with the app; the person using it may keep a <code>shell.qml</code> of their own where the app looks for one, and <code>ShellLoader</code> — <code>import Ljos.Blocks</code> — shows it in your shell's place. The state stays, the work goes on, and a broken edit falls back to the app's shell with <code>error</code> saying what broke and where, so an experiment never bricks the app. The compiler and the lints ship in the app, so the edit is checked the way your own code is. Underneath, saving a file patches the running window and keeps its state — that is the mechanics; the shape of the thing is that the interface belongs to whoever is looking at it."
        onLinkActivated: (link) => landing.follow(link)
    }
    CodeBlock {
        width: parent.width
        lang: "qml"
        code: "import Ljos.Blocks\n\nShellLoader {\n    source: \"shell.qml\"       // the user's own, where the app looks\n    fallback: \"AppShell.qml\"  // the app's, standing when theirs does not\n}\n"
        rich: "import Ljos.Blocks\n\nShellLoader {\n    source: \"shell.qml\"       // the user's own, where the app looks\n    fallback: \"AppShell.qml\"  // the app's, standing when theirs does not\n}\n"
    }
    // The flagship malleable demo mounts into this slot: a small app
    // whose shell the visitor rewrites on the page, its state kept, a
    // broken edit falling back with the error shown.
    Slot {
        name: "showcase-shell"
        delegate: Component {
            Rectangle {
                width: landing.textWidth
                height: shellNote.implicitHeight + 28
                color: Theme.panel
                border.color: Theme.border
                border.width: 1

                Text {
                    id: shellNote
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.top: parent.top
                    anchors.margins: 14
                    textFormat: Text.RichText
                    color: Theme.ink
                    font.family: Theme.sans
                    font.pixelSize: 14
                    wrapMode: Text.Wrap
                    text: "<b>Rewrite this app's shell.</b> The flagship demo stands here: a small app whose shell you edit on the page. Move where a <code>Slot</code> contribution lands and it moves; break the shell and the app's own shell stands in its place, with the error shown; the app's data and state survive both."
                }
            }
        }
    }

    Text {
        width: parent.width
        text: "TypeScript first"
        color: Theme.ink
        font.family: Theme.serif
        font.pixelSize: 26
        font.bold: true
        wrapMode: Text.Wrap
    }
    Text {
        width: parent.width
        textFormat: Text.RichText
        color: Theme.ink
        font.family: Theme.sans
        font.pixelSize: 15
        wrapMode: Text.Wrap
        text: "Interfaces are declarative; scripts are typed TypeScript, checked before anything runs. Handlers, functions and bindings carry their types, and the compiler says so where they do not add up. Application logic, models and native types can stay in Rust, registered with the engine and driven from the interface like anything else on the page. Existing QML runs as a way in — <a href=\"/language/porting-from-qt/\">bringing an app along</a> has its own page, out of the main path."
        onLinkActivated: (link) => landing.follow(link)
    }

    Text {
        width: parent.width
        text: "Observe and drive a running app"
        color: Theme.ink
        font.family: Theme.serif
        font.pixelSize: 26
        font.bold: true
        wrapMode: Text.Wrap
    }
    Text {
        width: parent.width
        textFormat: Text.RichText
        color: Theme.ink
        font.family: Theme.sans
        font.pixelSize: 15
        wrapMode: Text.Wrap
        text: "Every part of a running app can be observed and driven. <code>ljos observe</code> opens on its live objects, properties, bindings, frames and wakes, and sends real input; a coding agent gets the same view over <a href=\"/start/mcp/\">MCP</a>, static checking before the run and the live inspector during it. What an agent can reshape, it can also check."
        onLinkActivated: (link) => landing.follow(link)
    }

    Text {
        width: parent.width
        text: "Stable, and still at rest"
        color: Theme.ink
        font.family: Theme.serif
        font.pixelSize: 26
        font.bold: true
        wrapMode: Text.Wrap
    }
    Text {
        width: parent.width
        textFormat: Text.RichText
        color: Theme.ink
        font.family: Theme.sans
        font.pixelSize: 15
        wrapMode: Text.Wrap
        text: "Work runs when input, a timer, an animation or a message asks for it; nothing polls, and an app at rest uses 0 % CPU. A fault restarts the part of the interface that caused it, not the window. Other threads reach the interface through one bounded handle. The same engine renders on Linux, macOS and Windows, with Android and iOS behind the same scene graph — and on the web, where this site is itself a Ljós page, compiled ahead of time and written out as HTML at build time for any reader, script or none."
        onLinkActivated: (link) => landing.follow(link)
    }

    Text {
        width: parent.width
        text: "See it run"
        color: Theme.ink
        font.family: Theme.serif
        font.pixelSize: 26
        font.bold: true
        wrapMode: Text.Wrap
    }
    // The showcase mounts here: a 3D scene to orbit, a shader, a
    // whole app of the corpus, and motion. Each stands in its own
    // named place, with its description kept for a reader whose
    // browser cannot run it.
    Slot {
        name: "showcase"
        delegate: Component {
            Rectangle {
                width: landing.textWidth
                height: showNote.implicitHeight + 28
                color: Theme.panel
                border.color: Theme.border
                border.width: 1

                Text {
                    id: showNote
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.top: parent.top
                    anchors.margins: 14
                    textFormat: Text.RichText
                    color: Theme.ink
                    font.family: Theme.sans
                    font.pixelSize: 14
                    wrapMode: Text.Wrap
                    text: "The <a href=\"/demos/\">live demos</a> run in this page: a shell you rewrite, a 3D scene you can orbit, a shader effect, a whole app, and motion — each a complete Ljós app, each with a picture and its words where wasm or WebGPU is missing."
                    onLinkActivated: (link) => landing.follow(link)
                }
            }
        }
    }

    Text {
        width: parent.width
        text: "Start reading"
        color: Theme.ink
        font.family: Theme.serif
        font.pixelSize: 26
        font.bold: true
        wrapMode: Text.Wrap
    }
    Text {
        width: parent.width
        textFormat: Text.RichText
        color: Theme.ink
        font.family: Theme.sans
        font.pixelSize: 15
        wrapMode: Text.Wrap
        text: "<a href=\"/start/\">What is Ljós?</a> — the map of these docs.<br><a href=\"/start/first-app/\">Your first app</a> — a file, a window, live edits.<br><a href=\"/demos/\">Live demos</a> — every embedded example in one place.<br><a href=\"/quality/principles/\">Goals and principles</a> — what Ljós does, what it leaves out, and why."
        onLinkActivated: (link) => landing.follow(link)
    }
}
