import Ljos.Ui
import Ljos.Layout
import Ljos.Core
import Site
import Demos
import "../Showcase/example-live.js" as Example
import "../Showcase/logic/world.ts" as World
import "../Showcase/products.ts" as Products

// The engine an app is built on, as its entry in Showcase/products.json
// names it (ShowcaseApp hands its fields in): a line that says so and
// links to it, then the engine in its own words. Those are lines of one
// of its examples, cut by the build from a copy of the file at the
// commit the entry names, each linked to those lines there; beside
// them, that example running, drawn off-screen. An example the entry says
// runs in a browser (`live`, its name in Showcase/later.js) stands as
// that picture in a frame (DemoFrame) until the reader presses Run, and
// then runs in the page; Edit opens its file, and an edit that compiles
// is run in its place (Showcase/example-live.js), one that does not says
// what broke while the last world that did goes on.
Column {
    id: section

    required property string heading
    required property string line
    required property string label
    required property string href
    // The example: what it is, its file, and the snippets cut from it
    // ({ says, code, rich, link, href } each) and its capture, as
    // ShowcaseCapture reads one.
    required property string about
    required property string path
    required property unknown snippets
    required property Products.Capture capture
    // The example's name where it runs in the page (Showcase/later.js),
    // and what it is called, for its controls' names: "Run Snail Post".
    property string live: ""
    property string what: ""
    property string route: "/showcase/"
    property bool wide: true
    property Flickable scroller

    spacing: Theme.l

    // The editor, once the reader opens it: the example's own file as the
    // build copied it ({ path, lang, code, rich }), what the reader made
    // of it, and the world that made, as the frame's host gives it.
    readonly property string entry: "Main.qml"
    property bool editing: false
    property unknown file: undefined
    property string edit: ""
    // The reader changed the file: the edit is theirs, whatever it is,
    // an empty one too.
    property bool touched: false
    property unknown made: undefined
    property string said: ""
    property bool compiles: true
    // Why an edit cannot run here (no WebAssembly), said apart from what
    // went wrong with an edit, so a Reset leaves it.
    property string why: ""
    readonly property string notice: [section.why, section.said].filter((line) => line !== "").join("\n")
    // The text last given to the editor by the page, so the editor saying
    // it back is not taken for an edit.
    property string own: ""
    readonly property bool changed: section.file !== undefined && section.touched
    readonly property string code: World.codeOf(section.file)
    // The compiler's squiggles on the reader's text.
    property unknown diagnostics: []
    // Writing the editor's text (a Reset): to whichever editor is open.
    signal retyped(string text)

    // Bound here, not in the inline component that calls it: Ljós on the
    // desktop has no `bind` in an inline component's scope yet.
    function follow(item: unknown, name: string, value: () => unknown): void {
        item[name] = bind(value);
    }

    function openEditor(): void {
        section.editing = !section.editing;
        if (!section.editing || section.file !== undefined)
            return;
        Example.load(section.live).then((project) => {
            section.file = World.fileIn(project, section.entry);
            section.own = section.code;
            section.retyped(section.code);
        }, (error) => {
            section.said = World.messageOf(error);
        });
        Example.needsWasm().then((why) => {
            if (why !== "") {
                section.compiles = false;
                section.why = why;
            }
        });
    }
    function edited(text: string): void {
        if (text === section.own || section.file === undefined)
            return;
        section.own = text;
        section.edit = text;
        section.touched = text !== section.code;
        debounce.restart();
    }
    function apply(): void {
        if (!section.compiles)
            return;
        const asked = section.edit;
        if (!section.touched) {
            section.made = undefined;
            section.said = "";
            section.diagnostics = [];
            return;
        }
        Example.compile(section.live, section.entry, World.edits(section.entry, asked)).then((made) => {
            if (!section.touched || asked !== section.edit)
                return;
            section.said = "";
            section.made = made;
            section.diagnostics = [];
        }, (error) => {
            if (!section.touched || asked !== section.edit)
                return;
            section.said = World.messageOf(error);
            section.diagnostics = Example.diagnosticsOf(error, section.entry);
        });
    }
    function reset(): void {
        debounce.stop();
        section.edit = "";
        section.touched = false;
        section.made = undefined;
        section.said = "";
        section.own = section.code;
        section.diagnostics = [];
        section.retyped(section.code);
    }

    Timer {
        id: debounce
        interval: 500
        onTriggered: section.apply()
    }

    Column {
        width: parent.width
        spacing: Theme.s

        Text {
            width: parent.width
            text: section.heading
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
            text: section.line
            color: Theme.text
            font.family: Theme.sans
            font.size: Theme.bodySize + 1
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.bodyLine + 4
            wrap: Text.Wrap
        }
    }
    LinkButton {
        label: section.label
        href: section.href
    }
    Text {
        width: Math.min(parent.width, Theme.measure)
        text: section.about
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

            // On a desk the editor stands in the code's place, beside the
            // world it changes.
            Loader {
                width: parent.width
                active: section.editing && section.wide
                visible: active
                component: editorView
            }
            Repeater {
                model: section.editing && section.wide ? [] : section.snippets
                Column {
                    id: snippet
                    required property string says
                    required property string code
                    required property string rich
                    required property string link
                    required property string href
                    width: parent.width
                    spacing: Theme.xs

                    Text {
                        width: parent.width
                        text: snippet.says
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
                        file: section.path
                        code: snippet.code
                        rich: snippet.rich
                    }
                    LinkButton {
                        quiet: true
                        label: snippet.link
                        href: snippet.href
                    }
                }
            }
        }
        ShowcaseCapture {
            visible: section.live === ""
            width: pair.side
            capture: section.capture
            route: section.route
        }
        Column {
            visible: section.live !== ""
            width: pair.side
            spacing: Theme.s

            DemoFrame {
                width: parent.width
                scroller: section.scroller
                route: section.route
                aspect: section.capture.height / section.capture.width
                picture: "/showcase/media/" + section.capture.name + ".png"
                description: section.capture.alt
                what: section.what
                // Showcase/later.native.js gives it on the desktop.
                desktop: true
                demo: running
            }
            Text {
                width: parent.width
                text: section.capture.shows
                color: Theme.text
                font.family: Theme.sans
                font.size: Theme.bodySize
                font.weight: Font.DemiBold
                lineHeightMode: Text.FixedHeight
                lineHeight: Theme.bodyLine
                wrap: Text.Wrap
            }
            StageButton {
                checkable: true
                checked: section.editing
                text: section.editing ? t`Close the editor` : t`Edit`
                label: section.editing ? t`Close the editor of ${section.what}` : t`Edit ${section.what}`
                onPressed: section.openEditor()
            }
        }
    }

    // The example's file, to change: an edit is compiled as the reader
    // stops typing and, once it compiles, runs in the frame. On a phone
    // it stands under the world, which the reader's keyboard leaves in
    // sight.
    Loader {
        width: parent.width
        active: section.editing && !section.wide
        visible: active
        component: editorView
    }

    Component {
        id: editorView

        Column {
            width: parent.width
            spacing: Theme.s

            Connections {
                target: section
                function onRetyped(text: string): void {
                    editor.text = text;
                }
            }

            Rectangle {
                width: parent.width
                height: head.implicitHeight + Theme.xs
                fill: Theme.panel
                border.color: Theme.border
                border.width: 1

                Row {
                    id: head
                    x: Theme.s
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: Theme.m

                    Text {
                        Layout.alignment: Align.VCenter
                        text: section.path
                        color: Theme.muted
                        font.family: Theme.mono
                        font.size: Theme.captionSize
                    }
                    StageButton {
                        Layout.alignment: Align.VCenter
                        visible: section.changed
                        text: t`Reset`
                        label: t`Reset ${section.what} to its file`
                        onPressed: section.reset()
                    }
                }
            }
            Rectangle {
                width: parent.width
                height: section.wide ? 420 : 320
                fill: Theme.codeBg
                border.color: editor.activeFocus ? Theme.focusRing : Theme.border
                border.width: editor.activeFocus ? 2 : 1

                Flickable {
                    id: editorScroll
                    anchors.fill: parent
                    anchors.margins: Theme.s
                    contentWidth: editor.width
                    contentHeight: editor.height
                    clip: true

                    CodeEditor {
                        id: editor
                        // The Flickable's own width: its content item's follows
                        // the editor's, so the parent's would go round.
                        width: Math.max(editorScroll.width, implicitWidth)
                        code: section.code
                        rich: section.changed ? "" : World.richOf(section.file)
                        diagnostics: section.diagnostics
                        lang: "qml"
                        label: t`Edit ${section.path} of ${section.what}`
                        errors: told
                        onTextChanged: section.edited(text)
                        // Made again in the other place (the window turned): as
                        // the reader left it.
                        Component.onCompleted: if (section.touched) text = section.edit
                    }
                }
            }
            Text {
                id: told
                visible: section.notice !== ""
                width: parent.width
                text: section.notice
                color: Theme.danger
                font.family: Theme.mono
                font.size: Theme.captionSize
                wrap: Text.Wrap
            }
        }
    }

    // The example, given what the reader's edits made of it as they compile.
    Component {
        id: running
        Item {
            id: host
            property bool active: true
            property bool calm: false
            // The frame waits on what it holds; what it holds is the world.
            readonly property bool ready: app.item !== null && app.item !== undefined
            readonly property unknown observed: World.observedOf(app.item)
            ModuleLoader {
                id: app
                anchors.fill: parent
                module: Example.app(section.live)
                // The world follows its frame and the reader's edits, bound
                // as DemoFrame binds its demo's: a Binding would be on every
                // visit's first load (tests/payload.spec.js).
                onLoaded: {
                    section.follow(item, "active", () => host.active);
                    section.follow(item, "calm", () => host.calm);
                    section.follow(item, "live", () => section.made);
                }
            }
        }
    }
}
