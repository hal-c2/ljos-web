// Ljós's Core before QtQuick: only its t`` is wanted here, and a name
// both have (Timer) stays QtQuick's, the later import.
import Ljos.Core
import QtQuick
import QtQuick.Effects
import Ljos.Blocks
import Site
import "../live.js" as Live
import "../observed.js" as Observed
import "code-editor.js" as Editor

// A fenced block of a page. One that runs (`live` set by the build,
// docs/LJOS_WEB.md A27/A28) is the code beside its running result:
// an editor per file, and a stage the result stands in. As the page
// is first written — and for a reader with no script — the stage
// holds a picture of the result as the build prerendered it, and so
// does a browser's until the reader runs the block: Run on its
// toolbar, a press on its picture, or a first edit of its code (a focus
// in the code fetches only the editor). Only then is the compiler
// fetched, and the stage's ShellLoader compiles the code in the page
// and takes the stage over. Every edit recompiles and reloads with its
// state kept. A broken edit says why beside the code, and the last good
// result keeps running. A block that does not run is its code, coloured
// at build time, in a panel of its own.
//
// The result runs in a window on a stage, as an app on a desk: its own
// paper, framed and lifted off a ground of the page's, so that what it
// draws, however little, reads as an app and not as a gap in the page.
// Under it, what it says of itself: its root's declared properties as
// they change, what it logged and the signals it fired (observed.js).
//
// This component is the one face every fence goes through: plain
// and live alike, with the whole fence contract on it (`lang`, the
// verbatim `code`, and `harness`/`file`/`group`/`before` where the
// fence named them), so nothing downstream of a block changes with
// how live it is.
Column {
    id: block

    property string lang: ""
    property string code: ""
    property string rich: ""
    property string harness: ""
    property string file: ""
    property string group: ""
    property bool before: false
    // { hash, entry, before, harness?, harnessTemplate?, harnessFile?,
    //   display: [{ name, code, lang }], picture, width, height,
    //   logged? }
    property var live: null

    readonly property bool isLive: live !== null
    property int currentFile: 0
    property string said: ""
    // What the running example asked for and does not have.
    property string absent: ""
    property bool started: false
    // False where the browser runs no WebAssembly: there is no compiler,
    // so the block stays the build's picture and says why.
    property bool runs: true
    // A reader is in one of the editors: its box says so.
    property bool editing: false
    // Whether the example's code is shown above its stage: the toolbar's
    // Source hides it to leave the app alone, and Edit brings it back.
    property bool sourceShown: true
    // Whether that has been asked yet: nothing runs before it is known.
    property bool checked: false
    // The code is not as written: Reset puts it back.
    property bool edited: false
    // What the values strip shows: the running root's own properties
    // by name, and the last lines it logged or signals it fired.
    property var declaredNames: []
    property var lines: []
    property var disconnect: null
    readonly property string what: t`this example`
    readonly property string fileName: isLive ? live.display[currentFile].name : ""

    width: parent ? parent.width : 640
    spacing: 0

    function display() {
        var files = [];
        for (var i = 0; i < editors.count; i++) {
            var area = editors.itemAt(i);
            files.push({ "name": live.display[i].name, "code": area ? area.text : live.display[i].code, "lang": live.display[i].lang });
        }
        return files;
    }

    function recheck() {
        var changed = false;
        for (var i = 0; i < editors.count; i++) {
            var area = editors.itemAt(i);
            if (area && area.text !== live.display[i].code)
                changed = true;
        }
        edited = changed;
    }

    function reset() {
        for (var i = 0; i < editors.count; i++)
            editors.itemAt(i).text = live.display[i].code;
        apply();
    }

    // The running root, made again after each edit: its properties
    // are listed and its signals told afresh. Its log goes on.
    function observe() {
        if (disconnect) {
            disconnect();
            disconnect = null;
        }
        // A plain block's stage holds only the empty fallback.
        var root = isLive ? stage.item : null;
        declaredNames = root ? Observed.declared(root).properties : [];
        if (root)
            disconnect = Observed.connectSignals(live.hash, root);
    }

    function apply() {
        if (!isLive || !runs)
            return;
        Live.setFiles(live.hash, display());
        // Not running: an edit asks it to run, and it does once it may
        // (in view, within the page's budget: Runner).
        if (!started) {
            runner.ask();
            return;
        }
        stage.reload().then(function (why) {
            block.said = why || "";
            block.marked();
        });
    }

    // The source is given at once: a compile that answered first
    // would leave the stage empty until it did. What an earlier compile
    // said goes: this one says its own (the stage's error, and the
    // editors' marks once it has come). Only a block that can run
    // starts, so what is cleared is never the reason it cannot.
    function start() {
        started = true;
        said = "";
        // A run says its own lines: what the build heard goes.
        Observed.reset(live.hash, []);
        for (var i = 0; i < editors.count; i++)
            editors.itemAt(i).diagnostics = [];
        stage.source = Live.sourceFor(live.hash);
    }
    // Stopped (one more started, past the page's budget): the picture
    // stands again, and the edits are kept for when it runs again. An
    // edit still waiting out its debounce is kept too, not applied:
    // applied, it would ask the block to run again unasked, and stop
    // another.
    function stop() {
        started = false;
        if (debounce.running) {
            debounce.stop();
            Live.setFiles(live.hash, display());
        }
        stage.source = "";
        Observed.reset(live.hash, live.logged || []);
    }
    // The editors' marks, from the compile the stage last took.
    function marked() {
        for (var i = 0; i < editors.count; i++)
            editors.itemAt(i).diagnostics = Live.diagnosticsFor(live.hash, i);
    }

    Component.onCompleted: {
        if (!isLive)
            return;
        Live.setExample(live.hash, live.display, live.entry, live.harnessTemplate || "", live.harnessFile || "", function (lines) {
            block.absent = lines;
        }, live.given || null, function (namespace) {
            return Observed.inspectFor(live.hash, namespace);
        });
        Observed.watch(live.hash, block.heard);
        Observed.reset(live.hash, live.logged || []);
        // Asked as the page is made, not on the first edit: where the
        // compile cannot run, the block says so before it is reached
        // for, and what it says is why, not how the compile failed.
        Live.needsWasm().then(function (why) {
            block.checked = true;
            if (why) {
                block.runs = false;
                block.said = why;
            }
        });
    }

    Component.onDestruction: {
        if (!isLive)
            return;
        Observed.unwatch(live.hash, block.heard);
        if (disconnect)
            disconnect();
    }

    function heard(all) {
        block.lines = all.slice(Math.max(0, all.length - 6));
    }

    Timer {
        id: debounce
        interval: 300
        onTriggered: block.apply()
    }

    Rectangle {
        width: parent.width
        height: headRow.implicitHeight + 10
        color: Theme.surface
        border.color: Theme.divider
        border.width: 1

        Row {
            id: headRow
            anchors.left: parent.left
            anchors.leftMargin: 10
            anchors.verticalCenter: parent.verticalCenter
            spacing: 14

            Text {
                anchors.verticalCenter: parent.verticalCenter
                color: Theme.textMuted
                font.family: Theme.mono
                font.pixelSize: 11
                text: {
                    if (block.isLive)
                        return (block.live.before ? "Before · " : "") + (block.live.harness ? block.live.entry + " (in the " + block.live.harness + " harness)" : block.live.entry);
                    var parts = [block.lang || "text"];
                    if (block.file)
                        parts.push(block.file);
                    if (block.harness)
                        parts.push("harness=" + block.harness);
                    if (block.before)
                        parts.push("before");
                    return parts.join("  ");
                }
            }
        }
    }

    // Plain code: highlighted at build time, as written.
    Rectangle {
        visible: !block.isLive
        width: parent.width
        height: visible ? body.implicitHeight + 20 : 0
        color: Theme.codeBg
        border.color: Theme.divider
        border.width: 1

        Text {
            id: body
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.margins: 10
            color: Theme.codeFg
            font.family: Theme.mono
            font.pixelSize: 12
            // As a live block's editor sets its lines (CodeEditor): a
            // height the build and the browser agree on.
            lineHeightMode: Text.FixedHeight
            lineHeight: 18
            textFormat: Text.RichText
            wrapMode: Text.Wrap
            // The colouring (packed by the build, Editor.richOf) is
            // spans, markup rich text takes; a <pre> around them is
            // not (its words come back as text). Lines are breaks,
            // and a line's leading spaces are the indentation, kept.
            text: Editor.richOf(block.rich).split("\n").map(function (line) {
                var indent = /^ */.exec(line)[0];
                return "&nbsp;".repeat(indent.length) + line.slice(indent.length);
            }).join("<br/>")
        }
    }

    // Live: the editor (one file at a time, tabs where there are
    // several), then the stage.
    Column {
        visible: block.isLive
        width: parent.width
        spacing: 0

        Row {
            visible: block.isLive && block.sourceShown && block.live.display.length > 1
            spacing: 6
            // What holds the tabs, so a reader hears them as one set.
            Accessible.role: Accessible.PageTabList

            Repeater {
                model: block.isLive ? block.live.display : []

                Rectangle {
                    required property var modelData
                    required property int index

                    width: tabWords.implicitWidth + 16
                    height: tabWords.implicitHeight + 8
                    color: index === block.currentFile ? Theme.codeBg : Theme.surface
                    border.color: Theme.divider
                    border.width: 1
                    activeFocusOnTab: true
                    // A tab, named by its file: the toolbar's Edit is
                    // the one that says "Edit".
                    Accessible.role: Accessible.PageTab
                    Accessible.name: modelData.name
                    Accessible.selected: index === block.currentFile
                    Accessible.onPressAction: () => block.currentFile = index
                    Keys.onPressed: (event) => {
                        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                            block.currentFile = index;
                            event.accepted = true;
                        }
                    }

                    Text {
                        id: tabWords
                        anchors.centerIn: parent
                        text: modelData.name
                        color: Theme.codeFg
                        font.family: Theme.mono
                        font.pixelSize: 11
                        font.bold: index === block.currentFile
                    }
                    MouseArea {
                        anchors.fill: parent
                        Accessible.ignored: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: block.currentFile = index
                    }
                }
            }
        }

        Rectangle {
            visible: block.sourceShown
            width: parent.width
            height: visible ? editorBox.implicitHeight : 0
            color: Theme.codeBg
            border.color: block.editing ? Theme.focusRing : Theme.divider
            border.width: block.editing ? 2 : 1

            Column {
                id: editorBox
                width: parent.width
                // The code's first and last lines clear the box's edges.
                topPadding: 8
                bottomPadding: 8

                Repeater {
                    id: editors
                    model: block.isLive ? block.live.display : []

                    // Highlighted by the build; CodeMirror once the
                    // reader is in it (CodeEditor).
                    CodeEditor {
                        required property var modelData
                        required property int index

                        visible: index === block.currentFile
                        width: block.width - 20
                        x: 10
                        code: modelData.code
                        rich: modelData.rich || ""
                        lang: modelData.lang || "qml"
                        label: "Edit " + modelData.name
                        errors: told
                        onTextChanged: {
                            block.recheck();
                            if (block.started || text !== code)
                                debounce.restart();
                        }
                        onActiveFocusChanged: block.editing = activeFocus
                    }
                }
            }
        }

        // The stage's toolbar: what the reader can do with it, never
        // over what it draws.
        Rectangle {
            width: parent.width
            height: 48
            color: Theme.surface
            border.color: Theme.divider
            border.width: 1

            Row {
                anchors.left: parent.left
                anchors.leftMargin: Theme.s
                anchors.verticalCenter: parent.verticalCenter
                spacing: Theme.xs

                // One button through the run's phases, so the focus a
                // keyboard reader gave it stays as it changes.
                StageButton {
                    id: runButton
                    visible: runner.phase !== ""
                    primary: runner.phase === "picture"
                    busy: runner.phase === "loading"
                    text: runner.phase === "picture" ? t({ message: "Run", context: "stage" }) : runner.phase === "loading" ? t`Starting…` : t`Stop`
                    label: runner.phase === "picture" ? t`Run ${block.what}` : runner.phase === "loading" ? t`Starting ${block.what}…` : t`Stop ${block.what}`
                    onPressed: runner.act()
                }
                StageButton {
                    text: t({ message: "Edit", context: "stage" })
                    label: t`Edit ${block.fileName}`
                    onPressed: {
                        block.sourceShown = true;
                        editors.itemAt(block.currentFile).forceActiveFocus();
                    }
                }
                // Only once there is an edit to undo: a control that
                // cannot act is not shown, as a screen reader would not
                // be told it is off.
                StageButton {
                    visible: block.edited
                    text: t`Reset`
                    label: t`Reset ${block.what} to as written`
                    onPressed: block.reset()
                }
                StageButton {
                    id: sourceButton
                    checkable: true
                    checked: block.sourceShown
                    text: t({ message: "Source", context: "stage tab" })
                    label: t`Show the source`
                    onPressed: {
                        // Code that hides takes no keys: the reader's
                        // focus stays on what they pressed, and Edit
                        // has it to give back to the code.
                        if (block.sourceShown && block.editing)
                            sourceButton.forceActiveFocus();
                        block.sourceShown = !block.sourceShown;
                    }
                }
            }
            Rectangle {
                visible: block.edited
                anchors.right: parent.right
                anchors.rightMargin: Theme.s
                anchors.verticalCenter: parent.verticalCenter
                width: editedWords.implicitWidth + 2 * Theme.xs
                height: editedWords.implicitHeight + Theme.xxs
                radius: height / 2
                color: Theme.surfaceSelected
                Text {
                    id: editedWords
                    anchors.centerIn: parent
                    text: t`Edited`
                    color: Theme.textMuted
                    font.family: Theme.sans
                    font.pixelSize: 12
                }
            }
        }

        // The stage: a ground of the page's with the example's window
        // on it. In the window, the picture the build drew of the
        // result, and the running result over it once compiled. The
        // picture is an <img> in rich text, not an Image: an Image
        // paints only when its page runs, and this stage is exactly
        // what a reader without script is shown — the picture must
        // stand in the HTML as written.
        Rectangle {
            id: stageBox
            width: parent.width
            // Room around the window to see it as one, less on a phone.
            readonly property int pad: width < 480 ? Theme.s : Theme.l
            readonly property int pictureWidth: block.isLive ? Math.min(block.live.width, width - 2 * pad) : 0
            readonly property int pictureHeight: block.isLive && block.live.width > 0 ? pictureWidth * block.live.height / block.live.width : 0
            // An example that draws a sliver (a row of three ten-pixel
            // items) still has a window the reader can see, twice as
            // wide as it is tall, with the app at its own size in the
            // middle of it.
            readonly property int least: 96
            readonly property int leastWide: Math.min(2 * least, width - 2 * pad)
            height: frame.height + 2 * pad
            color: Theme.stage
            border.color: Theme.divider
            border.width: 1

            RectangularShadow {
                x: frame.x
                y: frame.y
                width: frame.width
                height: frame.height
                radius: frame.radius
                offset.y: 8
                blur: 24
                color: Theme.stageShadow
            }
            // The window's edge: a ring a pixel wider than the window,
            // under it, so nothing lies over what the app draws. A
            // pointer over the picture lights it, as a call to run.
            Rectangle {
                x: frame.x - 1
                y: frame.y - 1
                width: frame.width + 2
                height: frame.height + 2
                radius: frame.radius + 1
                color: runner.hovered ? Theme.accent : Theme.stageEdge

                Behavior on color {
                    ColorAnimation {
                        duration: Theme.moveSmall
                        easing.type: Easing.OutCubic
                    }
                }
            }
            // The window: the app's own paper, the build's too, so the
            // picture and the running app stand on the same ground.
            Rectangle {
                id: frame
                x: Math.round((stageBox.width - width) / 2)
                y: stageBox.pad
                // The app's own box: as wide as its picture, and as tall
                // as that or as it grows to be.
                readonly property int appWidth: stageBox.pictureWidth
                readonly property int appHeight: Math.max(stageBox.pictureHeight, stage.implicitHeight)
                readonly property int appX: Math.round((width - appWidth) / 2)
                readonly property int appY: Math.round((height - appHeight) / 2)
                width: Math.max(stageBox.leastWide, appWidth)
                height: Math.max(stageBox.least, appHeight)
                radius: Theme.radiusSmall
                color: Theme.paper
                clip: true

                Text {
                    // Until the result runs (Ready): before the reader
                    // reaches for the block, while its code compiles,
                    // after a first edit that did not compile (the empty
                    // fallback stands, status Fallback), and always where
                    // there is no compiler. Once Ready a failed edit
                    // keeps the last good result, so the picture never
                    // comes back over it.
                    visible: block.isLive && stage.status !== ShellLoader.Ready
                    x: frame.appX
                    y: frame.appY
                    textFormat: Text.RichText
                    text: block.isLive ? "<img src=\"" + block.live.picture + "\" width=\"" + stageBox.pictureWidth + "\" height=\"" + Math.round(stageBox.pictureHeight) + "\" alt=\"What this example draws\">" : ""
                }
                // The window fits its app to itself, as a window does:
                // what it draws is laid out at its picture's size, never
                // scaled. A 20 px dot stays a dot in a window of the
                // least size, not a pill as wide as the window.
                ShellLoader {
                    id: stage
                    x: frame.appX
                    y: frame.appY
                    width: frame.appWidth
                    height: frame.appHeight
                    fallback: emptyStage
                    // A start's compile has come, or failed: its marks.
                    onStatusChanged: if (block.started && status !== ShellLoader.Null) block.marked()
                    onItemChanged: block.observe()
                }
                Component {
                    id: emptyStage
                    Item {}
                }
                // Shown only when it holds a window: an empty one would
                // lie over the example the stage runs and take a
                // reader's press from its text fields.
                WindowContainer {
                    visible: window !== null
                    x: frame.appX
                    y: frame.appY
                    width: frame.appWidth
                    height: frame.appHeight
                    window: Live.windowOf(stage.item)
                }
                // Whether it runs: once the reader asks (Run, a press
                // on its picture, or an edit of its code), and only then
                // is the compiler fetched.
                Runner {
                    id: runner
                    spanWidth: frame.width
                    spanHeight: frame.height
                    can: block.isLive && block.runs && block.checked
                    ready: stage.status === ShellLoader.Ready
                    // A first edit that did not compile: the empty
                    // fallback stands, and the error is said under the
                    // block. The fallback stands with no error for want
                    // of a source too, before the first one comes: that
                    // is loading.
                    failed: stage.error !== "" && (stage.status === ShellLoader.Fallback || stage.status === ShellLoader.Error)
                    stops: true
                    // Unmade only when the budget stops it or the reader
                    // does: scrolled past or in a hidden tab it stays as
                    // the reader left it, what they typed in it kept, and
                    // never loads again, or says so, behind their back.
                    // Running.most bounds what that costs.
                    onStartedChanged: started ? block.start() : block.stop()
                }
            }
        }

        // Why it does not run, right under the window it does not run in.
        Text {
            id: told
            visible: text !== ""
            width: parent.width
            text: [block.said || stage.error, block.absent].filter(function (line) { return line !== ""; }).join("\n")
            color: Theme.danger
            font.family: Theme.mono
            font.pixelSize: 12
            wrapMode: Text.Wrap
        }

        // What it says of itself: none of it until there is some.
        Rectangle {
            id: values
            visible: block.isLive && (block.declaredNames.length > 0 || block.lines.length > 0)
            width: parent.width
            height: visible ? valuesColumn.implicitHeight + 2 * Theme.xs : 0
            color: Theme.surface
            border.color: Theme.divider
            border.width: 1
            Accessible.role: Accessible.Grouping
            Accessible.name: t`Values`

            Column {
                id: valuesColumn
                x: Theme.s
                y: Theme.xs
                width: parent.width - 2 * Theme.s
                spacing: Theme.xxs

                Flow {
                    width: parent.width
                    spacing: Theme.s

                    Text {
                        text: t`Values`
                        color: Theme.textMuted
                        font.family: Theme.sans
                        font.pixelSize: 12
                        font.weight: Font.DemiBold
                    }
                    Repeater {
                        model: block.declaredNames

                        Text {
                            required property string modelData
                            color: Theme.text
                            font.family: Theme.mono
                            font.pixelSize: 12
                            text: modelData + ": " + Observed.show(stage.item ? stage.item[modelData] : undefined)
                        }
                    }
                }
                Repeater {
                    model: block.lines

                    Text {
                        required property var modelData
                        width: valuesColumn.width
                        wrapMode: Text.Wrap
                        color: modelData.level === "warn" || modelData.level === "error" ? Theme.danger : modelData.level === "signal" ? Theme.link : Theme.text
                        font.family: Theme.mono
                        font.pixelSize: 12
                        text: (modelData.level === "signal" ? "↯ " : "› ") + modelData.message
                    }
                }
            }
        }
    }
}
