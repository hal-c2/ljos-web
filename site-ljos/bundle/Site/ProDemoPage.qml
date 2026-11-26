// Ljós's Core before QtQuick: only its t`` is wanted here.
import Ljos.Core
pragma Scripts: JavaScript; import Ljos.Ui
import Ljos.Layout
import Site
import "../Demos/pro-live.js" as Live
import "../nav.js" as Nav
import "logic/place.ts" as Place

// A pro demo's page (Demos/pro.json, `demo` its entry): a whole app
// running in the page, with its files below it to read, change and
// download. An edit is compiled in the page against the other files as
// they stand and, once it compiles, the app is made again from it; one
// that does not is refused with what broke, and the last app that
// compiled stays. The files come with the page's script
// (Demos/<name>-project.json), not in its HTML: a reader without script
// has the app's picture and a link to each file to download.
Column {
    id: page

    // The demo and whether the page is wide, from what loads it
    // (PageView's Loader), so both are there as it is made.
    property var demo: Place.demoIn(parent)
    // What this page says of it, which no other page carries (ProText).
    readonly property var words: demo ? ProText.of[demo.name] ?? ({}) : ({})
    property var scroller: null
    property bool wide: Place.wideIn(parent)

    // The files, once they came: [{ path, lang, code, rich }].
    property var files: []
    property string path: page.demo.entry
    // What the reader changed, by file; a file they set back is not here.
    property var edits: ({})
    property var live: null
    property string said: ""
    // What the reader's current edits made the compiler say, by file:
    // the editor's squiggles. Only the compile of the edits as they
    // still stand writes it, so one that lands late says nothing.
    property var marks: ({})
    property bool runs: true
    // The text last given to the editor by the page, so the editor saying
    // it back is not taken for an edit.
    property string own: ""
    readonly property var file: files.find((entry) => entry.path === path) ?? null
    readonly property string sourceBase: Content.base + "demos/" + page.demo.name + "/source/"

    width: parent ? parent.width : 1040
    spacing: Theme.l
    topPadding: page.wide ? Theme.xl : Theme.m

    Component.onCompleted: page.open()
    // The shell keeps this page from one pro demo's route to the next, so
    // a new demo starts it afresh, and what was asked for the last one is
    // dropped when it comes.
    onDemoChanged: page.open()

    function open() {
        const name = page.demo.name;
        debounce.stop();
        files = [];
        edits = {};
        live = null;
        said = "";
        marks = {};
        runs = true;
        own = "";
        path = page.demo.entry;
        // A new demo comes in at its own entry file on Tab, not at the
        // place the keyboard had in the last one.
        fileTabs.stop = -1;
        Live.load(name).then((project) => {
            if (page.demo.name !== name)
                return;
            page.files = project.files;
            page.show(page.path);
        });
        Live.needsWasm().then((why) => {
            if (why && page.demo.name === name) {
                page.runs = false;
                page.said = why;
            }
        });
    }

    // The app loaded in the frame (`running`) follows its host and the
    // page's edits. It is here, not in the Loader's handler, because the
    // compiler reads `bind` in a component as a model's role.
    function hand(app, host) {
        app.active = bind(() => host.active);
        app.calm = bind(() => host.calm);
        app.live = bind(() => page.live);
    }
    function show(next) {
        path = next;
        const text = Object.hasOwn(edits, next) ? edits[next] : (file ? file.code : "");
        own = text;
        editor.text = text;
        editor.diagnostics = marks[next] || [];
    }
    function edited(text) {
        if (text === own || !file)
            return;
        own = text;
        const next = Object.assign({}, edits);
        if (text === file.code)
            delete next[path];
        else
            next[path] = text;
        edits = next;
        debounce.restart();
    }
    function apply() {
        if (!runs)
            return;
        const asked = edits;
        const name = page.demo.name;
        Live.compile(name, page.demo.entry, asked, sourceBase).then((made) => {
            if (asked !== page.edits || page.demo.name !== name)
                return;
            page.said = "";
            page.marks = {};
            page.live = Object.keys(asked).length > 0 ? made : null;
            editor.diagnostics = [];
        }, (error) => {
            if (asked !== page.edits || page.demo.name !== name)
                return;
            page.said = error.message;
            page.marks = error.diagnostics || {};
            editor.diagnostics = page.marks[page.path] || [];
        });
    }
    function reset() {
        // An edit waiting to be compiled is set back with the rest, and
        // what a broken one said goes with it.
        debounce.stop();
        edits = {};
        live = null;
        said = "";
        marks = {};
        show(path);
    }

    Timer {
        id: debounce
        interval: 500
        onTriggered: page.apply()
    }

    Column {
        width: parent.width
        spacing: Theme.s

        Text {
            width: parent.width
            text: page.demo.title
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
            // Read from the side the page starts on (LayoutMirroring).
            Layout.alignment: App.layoutDirection === Direction.RightToLeft ? Align.Right : Align.Left
            width: Math.min(parent.width, Theme.measure)
            text: page.words.summary
            color: Theme.textMuted
            font.family: Theme.sans
            font.size: Theme.subtitleSize - 1
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.subtitleLine - 2
            wrap: Text.Wrap
        }
    }

    DemoFrame {
        width: parent.width
        scroller: page.scroller
        needs: page.demo.needs
        route: page.demo.route
        // A demo laid out for a tall frame too (`compact`) has that shape
        // where the page is narrow.
        aspect: !page.wide && page.demo.compact ? page.demo.compact.height / page.demo.compact.width : page.demo.height / page.demo.width
        // In the scheme the demo is drawn in, and in the frame's shape
        // (nav.js proPicture).
        picture: Nav.proPicture(page.demo, Theme.picked, Theme.dark, !page.wide)
        what: page.demo.what
        description: page.words.shows
        demo: running
    }
    // The app, with the page's edits given to it as they compile.
    Component {
        id: running
        Item {
            id: host
            property bool active: true
            property bool calm: false
            // The frame waits on what it holds; what it holds is the app.
            readonly property bool ready: app.status === Loader.Ready && app.item !== null && app.item.ready !== false
            // What the Observer is on: the app, not this frame round it.
            readonly property var observed: app.item
            Loader {
                id: app
                anchors.fill: parent
                source: Live.app(page.demo.name)
                onLoaded: page.hand(item, host)
            }
        }
    }

    // How to use the app, for a demo whose entry says (`use`).
    Text {
        visible: (page.words.use ?? "") !== ""
        // Read from the side the page starts on (LayoutMirroring).
        Layout.alignment: App.layoutDirection === Direction.RightToLeft ? Align.Right : Align.Left
        width: Math.min(parent.width, Theme.measure)
        text: page.words.use ?? ""
        color: Theme.textMuted
        font.family: Theme.sans
        font.size: Theme.bodySize
        lineHeightMode: Text.FixedHeight
        lineHeight: Theme.bodyLine
        wrap: Text.Wrap
    }

    Column {
        width: parent.width
        spacing: Theme.s

        Text {
            width: parent.width
            text: t`Its files`
            color: Theme.text
            font.family: Theme.sans
            font.size: page.wide ? Theme.titleSize + 1 : Theme.titleSize - 1
            font.weight: Font.Bold
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.titleLine + 4
            readonly property int headingLevel: 2
            Accessible.role: Accessible.Heading
        }
        Text {
            // Read from the side the page starts on (LayoutMirroring).
            Layout.alignment: App.layoutDirection === Direction.RightToLeft ? Align.Right : Align.Left
            width: Math.min(parent.width, Theme.measure)
            text: page.words.tryThis
            color: Theme.textMuted
            font.family: Theme.sans
            font.size: Theme.bodySize
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.bodyLine
            wrap: Text.Wrap
        }

        Flow {
            width: parent.width
            spacing: Theme.xxs
            // A tab for each file, which shows it in the editor below. Their
            // paths come with the page (ProText), so the tabs it was written
            // with are the ones it is made with; the code comes after.
            Accessible.role: Accessible.PageTabList
            Accessible.name: t`The files of ${page.demo.what}`

            Repeater {
                id: fileTabs
                model: page.words.paths ?? []
                // The tabs are one stop on Tab, and the arrows go along them:
                // the ARIA tab pattern a tab list is announced with. The stop
                // is the tab the keyboard was last on, so Shift+Tab from a tab
                // an arrow reached leaves the row as Tab does; until then it is
                // the chosen file's, or the first's while none is.
                property int stop: -1
                readonly property int stopAt: stop >= 0 && stop < count ? stop : Math.max(0, (page.words.paths ?? []).indexOf(page.path))
                function focusAt(at) {
                    const next = fileTabs.itemAt((at + fileTabs.count) % fileTabs.count);
                    if (next)
                        next.forceActiveFocus(FocusReason.Tab);
                }
                delegate: Rectangle {
                    id: tab
                    required property string modelData
                    required property int index
                    readonly property bool chosen: modelData === page.path
                    readonly property bool changed: Object.hasOwn(page.edits, modelData)
                    width: name.implicitWidth + 2 * Theme.xs
                    height: name.implicitHeight + Theme.xs
                    radius: Theme.radiusSmall
                    fill: chosen ? Theme.surfaceSelected : press.containsMouse ? Theme.surfaceHover : Theme.surface
                    border.color: activeFocus ? Theme.focusRing : chosen ? Theme.accent : Theme.border
                    border.width: activeFocus ? 2 : 1
                    activeFocusOnTab: index === fileTabs.stopAt
                    onActiveFocusChanged: if (activeFocus) fileTabs.stop = index
                    // A file chosen by pointer takes the stop too, so Tab comes
                    // back to the open file and not to one the keyboard left;
                    // and the keyboard with it while it is in the row, as the
                    // tab it was on is no stop now. The open file's tab clicked
                    // again changes no file, so the click takes it as well.
                    function take() {
                        const had = fileTabs.itemAt(fileTabs.stopAt);
                        fileTabs.stop = index;
                        if (had && had !== tab && had.activeFocus)
                            tab.forceActiveFocus(FocusReason.Other);
                    }
                    onChosenChanged: if (chosen) take()
                    Accessible.role: Accessible.PageTab
                    Accessible.name: modelData + (changed ? ", changed" : "")
                    Accessible.selected: chosen
                    Accessible.onPressAction: () => page.show(modelData)
                    Keys.onPressed: (event) => {
                        if (event.key === Key.Right || event.key === Key.Left) {
                            // Along the row as it is drawn: on a right-to-left
                            // page Right goes back. Past either end, round.
                            const forward = (event.key === Key.Right) !== (App.layoutDirection === Direction.RightToLeft);
                            fileTabs.focusAt(tab.index + (forward ? 1 : -1));
                            event.accepted = true;
                        } else if (event.key === Key.Return || event.key === Key.Enter || event.key === Key.Space) {
                            page.show(tab.modelData);
                            event.accepted = true;
                        }
                    }

                    Text {
                        id: name
                        anchors.centerIn: parent
                        text: tab.modelData + (tab.changed ? " •" : "")
                        color: tab.chosen ? Theme.text : Theme.textMuted
                        font.family: Theme.mono
                        font.size: Theme.captionSize
                    }
                    PointerArea {
                        id: press
                        anchors.fill: parent
                        hoverEnabled: true
                        Accessible.ignored: true
                        cursorShape: Cursor.PointingHand
                        onClicked: {
                            page.show(tab.modelData);
                            tab.take();
                        }
                    }
                }
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
                anchors.left: parent.left
                anchors.leftMargin: Theme.s
                anchors.verticalCenter: parent.verticalCenter
                spacing: Theme.m

                Text {
                    Layout.alignment: Align.VCenter
                    text: page.path
                    color: Theme.muted
                    font.family: Theme.mono
                    font.size: Theme.captionSize
                }
                Text {
                    Layout.alignment: Align.VCenter
                    visible: Object.keys(page.edits).length > 0
                    text: t`Reset every file`
                    color: Theme.link
                    font.family: Theme.sans
                    font.size: Theme.captionSize
                    activeFocusOnTab: visible
                    Accessible.role: Accessible.Button
                    Accessible.name: text
                    Accessible.onPressAction: () => page.reset()
                    Keys.onPressed: (event) => {
                        if (event.key === Key.Return || event.key === Key.Enter || event.key === Key.Space) {
                            page.reset();
                            event.accepted = true;
                        }
                    }
                    PointerArea {
                        anchors.fill: parent
                        Accessible.ignored: true
                        cursorShape: Cursor.PointingHand
                        onClicked: page.reset()
                    }
                }
                Text {
                    Layout.alignment: Align.VCenter
                    text: "<a href=\"" + page.sourceBase + page.path + "\" download>Download it</a>"
                    format: Text.RichText
                    linkColor: Theme.link
                    font.family: Theme.sans
                    font.size: Theme.captionSize
                    onLinkActivated: (link) => App.openUrlExternally(link)
                }
            }
        }

        Rectangle {
            width: parent.width
            height: page.wide ? 420 : 320
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
                    code: page.file ? page.file.code : ""
                    rich: page.file && !Object.hasOwn(page.edits, page.path) ? page.file.rich : ""
                    lang: page.file ? page.file.lang : "qml"
                    label: t`Edit ${page.path} of ${page.demo.what}`
                    errors: told
                    onTextChanged: page.edited(text)
                }
            }
        }

        Text {
            id: told
            visible: page.said !== ""
            width: parent.width
            text: page.said
            color: Theme.danger
            font.family: Theme.mono
            font.size: Theme.captionSize
            wrap: Text.Wrap
        }
    }
}
