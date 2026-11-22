// Ljós's Core before QtQuick: only its t`` is wanted here, and a name
// both have (Timer) stays QtQuick's, the later import.
import Ljos.Core
import QtQuick
import QtQuick.Effects
import Ljos.Blocks
import Site
import "../live.js" as Live
import "../observed.js" as Observed
import "../observing.js" as Observing
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
    // by name (or, when it declares none, those it was written with),
    // and the last lines it logged or signals it fired.
    property var declaredNames: []
    property var lines: []
    property var disconnect: null
    // This block among all the page has made: what Live and Observed keep
    // its files, compiler, diagnostics and log by. Not its code's hash: two
    // blocks of the same code are two examples, each edited, run and heard
    // on its own.
    property string key: ""
    // Whether the Observer the toolbar opens is on this block's app.
    property bool observing: false
    readonly property string what: t`this example`
    readonly property string fileName: isLive ? live.display[currentFile].name : ""
    // Copy has just copied: it says so for a moment.
    property bool copied: false
    readonly property string language: languageOf(isLive ? (live.display[currentFile].lang || "qml") : lang)
    // What the card is of, as its name and Copy say it: a live block's
    // entry file, or a plain block's file, or else its language.
    readonly property string title: isLive ? live.entry : (file || language)
    // The file named in the head: none where tabs name them.
    readonly property string fileShown: isLive ? (live.display.length > 1 && sourceShown ? "" : (live.display.length > 1 ? live.entry : fileName)) : file
    readonly property string harnessName: isLive ? (live.harness || "") : harness
    readonly property var chips: (isLive ? live.before : before) ? [language, t`Before`] : [language]
    // How far the code and the head's words sit from the card's edge:
    // less on a phone, where every column of code counts.
    readonly property int inset: width < 480 ? Theme.s : Theme.m

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
        // Writing the texts back restarts the edit's debounce, and an
        // edit typed just before may still be waiting on it: either
        // would compile and reload the same code a second time.
        debounce.stop();
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
        declaredNames = root ? Observed.shown(root) : [];
        if (root)
            disconnect = Observed.connectSignals(block.key, root);
        // The Observer on it follows it made again, and closes with it.
        Observing.retarget(block.key, root);
    }

    function toggleObserver() {
        Observing.toggle(block.key, stage.item, Observed.logSource(block.key), fileName);
    }

    function observerMoved() {
        observing = Observing.isShown(block.key);
    }

    function apply() {
        if (!isLive || !runs)
            return;
        Live.setFiles(block.key, display());
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
    // starts, so what is cleared is never the reason it cannot. What
    // runs is the code the editors show: an undo back to the code as
    // written, made while stopped, ran nothing to say so, and an edit
    // still waiting out its debounce would run it a second time.
    function start() {
        started = true;
        said = "";
        debounce.stop();
        Live.setFiles(block.key, display());
        // A run says its own lines: what the build heard goes.
        Observed.reset(block.key, []);
        for (var i = 0; i < editors.count; i++)
            editors.itemAt(i).diagnostics = [];
        stage.source = Live.sourceFor(block.key);
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
            Live.setFiles(block.key, display());
        }
        stage.source = "";
        Observed.reset(block.key, live.logged || []);
    }
    // The editors' marks, from the compile the stage last took.
    function marked() {
        for (var i = 0; i < editors.count; i++)
            editors.itemAt(i).diagnostics = Live.diagnosticsFor(block.key, i);
    }

    Component.onCompleted: {
        if (!isLive)
            return;
        key = Live.keyFor(live.hash);
        Live.setExample(block.key, live.display, live.entry, live.harnessTemplate || "", live.harnessFile || "", function (lines) {
            block.absent = lines;
        }, live.given || null, function (namespace) {
            return Observed.inspectFor(block.key, namespace);
        });
        Observed.watch(block.key, block.heard);
        Observing.watch(block.observerMoved);
        Observed.reset(block.key, live.logged || []);
        // What the build heard is in the strip as the block is made, so a
        // prerendered page has it: the build does not wait out a timer.
        showLines.stop();
        shownLines();
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
        Observed.unwatch(block.key, block.heard);
        Observing.unwatch(block.observerMoved);
        Observing.close(block.key);
        if (disconnect)
            disconnect();
        // A block made again (the page left and come back to) is a new
        // key: what this one kept would never be read.
        Observed.forget(block.key);
        Live.forget(block.key);
    }

    // Each line is told as it is said; the strip is rebuilt once for all
    // said in one go (a loop that logs, a burst of signals), on the next
    // turn, from the lines as they are then.
    function heard() {
        if (!showLines.running)
            showLines.start();
    }

    function shownLines() {
        var all = Observed.lines(block.key);
        block.lines = all.slice(Math.max(0, all.length - 6));
    }

    Timer {
        id: showLines
        interval: 0
        onTriggered: block.shownLines()
    }

    Timer {
        id: debounce
        interval: 300
        onTriggered: block.apply()
    }

    // How a language is named in the card's chip.
    function languageOf(name) {
        switch (String(name || "text").toLowerCase()) {
        case "qml":
            return "QML";
        case "ts":
        case "typescript":
        case "lts":
            return "TypeScript";
        case "js":
        case "javascript":
        case "mjs":
            return "JavaScript";
        case "sh":
        case "bash":
        case "shell":
        case "console":
            return t({ message: "Shell", context: "code language" });
        case "rust":
        case "rs":
            return "Rust";
        case "toml":
            return "TOML";
        case "json":
            return "JSON";
        case "xml":
            return "XML";
        case "gherkin":
        case "feature":
            return "Gherkin";
        case "text":
        case "txt":
        case "plain":
        case "plaintext":
            return t({ message: "Text", context: "code language" });
        }
        return name;
    }

    // The code the card shows now, as the reader would paste it: a
    // live block's edits included.
    function shownCode() {
        if (!isLive)
            return code.replace(/\n$/, "");
        var area = editors.itemAt(currentFile);
        return area ? area.text : live.display[currentFile].code;
    }

    function copyCode() {
        Editor.copy(shownCode()).then(function (done) {
            if (!done)
                return;
            block.copied = true;
            copiedFor.restart();
        });
    }

    // Copy says it copied for a moment, then is Copy again.
    Timer {
        id: copiedFor
        interval: 1500
        onTriggered: block.copied = false
    }

    // One card: its head (what the code is, and Copy), the code, and a
    // live block's stage under it, parted by hairlines, not each in a
    // box of its own.
    Rectangle {
        id: card
        width: parent.width
        height: cardColumn.height + 2
        radius: Theme.radius
        color: Theme.codeBg
        border.color: Theme.divider
        border.width: 1
        clip: true
        // Its name in the page whatever the language: tests find the card
        // by it, as its accessible name is translated.
        objectName: "codeCard"
        Accessible.role: Accessible.Grouping
        Accessible.name: t`Code: ${block.title}`

        Column {
            id: cardColumn
            x: 1
            y: 1
            width: parent.width - 2

            Rectangle {
                id: head
                width: parent.width
                height: Math.max(named.height, copyButton.height) + 2 * Theme.xs
                color: Theme.surface

                Flow {
                    id: named
                    x: block.inset
                    y: Math.round((head.height - height) / 2)
                    width: head.width - x - copyButton.width - Theme.xs - Theme.s
                    spacing: Theme.xs

                    // A live block of several files: a tab each, which
                    // name the files; of one, its name.
                    Row {
                        visible: block.isLive && block.sourceShown && block.live.display.length > 1
                        // What holds the tabs, so a reader hears them as one set.
                        Accessible.role: Accessible.PageTabList

                        Repeater {
                            model: block.isLive ? block.live.display : []

                            Item {
                                id: tab
                                required property var modelData
                                required property int index
                                readonly property bool current: index === block.currentFile

                                width: tabWords.implicitWidth + 2 * Theme.xs
                                height: 32
                                activeFocusOnTab: true
                                // A tab, named by its file: the toolbar's Edit is
                                // the one that says "Edit".
                                Accessible.role: Accessible.PageTab
                                Accessible.name: modelData.name
                                Accessible.selected: current
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
                                    text: tab.modelData.name
                                    color: tab.current ? Theme.text : Theme.textMuted
                                    font.family: Theme.mono
                                    font.pixelSize: Theme.captionSize
                                    font.weight: tab.current ? Font.DemiBold : Font.Normal
                                }
                                // The file shown: underlined in the accent.
                                Rectangle {
                                    visible: tab.current
                                    anchors.bottom: parent.bottom
                                    width: parent.width
                                    height: 2
                                    radius: 1
                                    color: Theme.accent
                                }
                                Rectangle {
                                    visible: tab.activeFocus
                                    anchors.fill: parent
                                    radius: Theme.radiusSmall
                                    color: "transparent"
                                    border.color: Theme.focusRing
                                    border.width: 2
                                }
                                MouseArea {
                                    anchors.fill: parent
                                    Accessible.ignored: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: block.currentFile = tab.index
                                }
                            }
                        }
                    }
                    Text {
                        visible: block.fileShown !== ""
                        height: 32
                        verticalAlignment: Text.AlignVCenter
                        text: block.fileShown
                        color: Theme.text
                        font.family: Theme.mono
                        font.pixelSize: Theme.captionSize
                        font.weight: Font.DemiBold
                    }
                    // The language, and an example that is the "before"
                    // of a pair, as chips.
                    Repeater {
                        model: block.chips

                        Item {
                            required property string modelData
                            width: chipBox.width
                            height: 32

                            Rectangle {
                                id: chipBox
                                anchors.verticalCenter: parent.verticalCenter
                                width: chipWords.implicitWidth + 2 * Theme.xs
                                height: chipWords.implicitHeight + Theme.xxs
                                radius: height / 2
                                color: Theme.surfaceSelected

                                Text {
                                    id: chipWords
                                    anchors.centerIn: parent
                                    text: modelData
                                    color: Theme.text
                                    font.family: Theme.sans
                                    font.pixelSize: Theme.captionSize
                                }
                            }
                        }
                    }
                    Text {
                        visible: block.harnessName !== ""
                        height: 32
                        verticalAlignment: Text.AlignVCenter
                        text: t`in the ${block.harnessName} harness`
                        color: Theme.textMuted
                        font.family: Theme.sans
                        font.pixelSize: Theme.captionSize
                    }
                }
                StageButton {
                    id: copyButton
                    anchors.right: parent.right
                    anchors.rightMargin: Theme.xs
                    anchors.verticalCenter: parent.verticalCenter
                    text: block.copied ? t`Copied` : t({ message: "Copy", context: "code" })
                    label: block.copied ? t`Copied` : t`Copy ${block.isLive ? block.fileName : block.title}`
                    onPressed: block.copyCode()
                }
            }
            Rectangle {
                width: parent.width
                height: 1
                color: Theme.divider
            }

            // Plain code: highlighted at build time, as written, every
            // line whole. A line wider than the card scrolls inside it
            // (a wheel, a finger, the keyboard), never the page; a press
            // and drag selects, as it does in any text.
            Flickable {
                id: plainScroll
                visible: !block.isLive
                width: parent.width
                height: visible ? body.height + 2 * Theme.s : 0
                contentWidth: Math.max(width, body.implicitWidth + 2 * block.inset)
                contentHeight: height
                flickableDirection: Flickable.HorizontalFlick
                boundsBehavior: Flickable.StopAtBounds
                acceptedButtons: Qt.NoButton
                clip: true

                Text {
                    id: body
                    x: block.inset
                    y: Theme.s
                    color: Theme.codeFg
                    font.family: Theme.mono
                    font.pixelSize: Theme.codeSize
                    // As a live block's editor sets its lines (CodeEditor): a
                    // height the build and the browser agree on.
                    lineHeightMode: Text.FixedHeight
                    lineHeight: Theme.codeLine
                    textFormat: Text.RichText
                    wrapMode: Text.NoWrap
                    // The colouring (packed by the build) as rich text
                    // shows it: lines are breaks, and every space stays.
                    text: Editor.shownAs(block.rich, block.code, block.code)
                }
            }

            // Live: the editor (one file at a time, tabs in the head where
            // there are several), then the stage.
            Column {
                visible: block.isLive
                width: parent.width
                spacing: 0

                // The editor's box, which rings while the reader is in it.
                Rectangle {
                    visible: block.sourceShown
                    width: parent.width
                    height: visible ? editorScroll.height : 0
                    color: Theme.codeBg
                    border.color: Theme.focusRing
                    border.width: block.editing ? 2 : 0

                    Flickable {
                        id: editorScroll
                        width: parent.width
                        height: editorBox.height
                        contentWidth: Math.max(width, editorBox.implicitWidth)
                        contentHeight: editorBox.height
                        flickableDirection: Flickable.HorizontalFlick
                        boundsBehavior: Flickable.StopAtBounds
                        acceptedButtons: Qt.NoButton
                        clip: true

                        Column {
                            id: editorBox
                            // The code's first and last lines, and its
                            // first column, clear the box's edges.
                            topPadding: Theme.s
                            bottomPadding: Theme.s
                            leftPadding: block.inset
                            rightPadding: block.inset

                            Repeater {
                                id: editors
                                model: block.isLive ? block.live.display : []

                                // Highlighted by the build; CodeMirror once the
                                // reader is in it (CodeEditor). As wide as its
                                // longest line, so the box scrolls to all of it.
                                CodeEditor {
                                    required property var modelData
                                    required property int index

                                    visible: index === block.currentFile
                                    width: Math.max(editorScroll.width - 2 * block.inset, implicitWidth)
                                    pixelSize: Theme.codeSize
                                    lineHeight: Theme.codeLine
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
                }
                Rectangle {
                    visible: block.sourceShown
                    width: parent.width
                    height: visible ? 1 : 0
                    color: Theme.divider
                }

                // The stage's toolbar: what the reader can do with it, never
                // over what it draws.
                Rectangle {
                    width: parent.width
                    height: 48
                    color: Theme.surface

                    Row {
                        anchors.left: parent.left
                        anchors.leftMargin: block.inset
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
                        // Ljós's Observer on the app running here: its objects,
                        // properties, frames and log, as `ljos observe` shows a
                        // native one's. Only while it runs.
                        ObserverButton {
                            visible: stage.status === ShellLoader.Ready && stage.item !== null
                            checked: block.observing
                            label: t`Observer for ${block.what}`
                            onPressed: block.toggleObserver()
                        }
                    }
                    Rectangle {
                        visible: block.edited
                        anchors.right: parent.right
                        anchors.rightMargin: block.inset
                        anchors.verticalCenter: parent.verticalCenter
                        width: editedWords.implicitWidth + 2 * Theme.xs
                        height: editedWords.implicitHeight + Theme.xxs
                        radius: height / 2
                        color: Theme.surfaceSelected
                        Text {
                            id: editedWords
                            anchors.centerIn: parent
                            text: t`Edited`
                            color: Theme.text
                            font.family: Theme.sans
                            font.pixelSize: Theme.captionSize
                        }
                    }
                }
                Rectangle {
                    width: parent.width
                    height: 1
                    color: Theme.divider
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
                Rectangle {
                    visible: told.text !== ""
                    width: parent.width
                    height: visible ? told.implicitHeight + 2 * Theme.xs : 0
                    color: Theme.surface

                    Text {
                        id: told
                        x: block.inset
                        y: Theme.xs
                        width: parent.width - 2 * block.inset
                        text: [block.said || stage.error, block.absent].filter(function (line) { return line !== ""; }).join("\n")
                        color: Theme.danger
                        font.family: Theme.mono
                        font.pixelSize: Theme.captionSize
                        lineHeight: Theme.captionLine
                        lineHeightMode: Text.FixedHeight
                        wrapMode: Text.Wrap
                    }
                }

                // What it says of itself: none of it until there is some.
                Rectangle {
                    id: values
                    visible: block.isLive && (block.declaredNames.length > 0 || block.lines.length > 0)
                    width: parent.width
                    height: visible ? valuesColumn.implicitHeight + 2 * Theme.xs + 1 : 0
                    color: Theme.surface
                    Accessible.role: Accessible.Grouping
                    Accessible.name: t`Values`

                    Rectangle {
                        width: parent.width
                        height: 1
                        color: Theme.divider
                    }
                    Column {
                        id: valuesColumn
                        x: block.inset
                        y: Theme.xs + 1
                        width: parent.width - 2 * block.inset
                        spacing: Theme.xxs

                        Flow {
                            width: parent.width
                            spacing: Theme.s

                            Text {
                                text: t`Values`
                                color: Theme.textMuted
                                font.family: Theme.sans
                                font.pixelSize: Theme.captionSize
                                font.weight: Font.DemiBold
                            }
                            Repeater {
                                model: block.declaredNames

                                Text {
                                    required property string modelData
                                    color: Theme.text
                                    font.family: Theme.mono
                                    font.pixelSize: Theme.captionSize
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
                                font.pixelSize: Theme.captionSize
                                text: (modelData.level === "signal" ? "↯ " : "› ") + modelData.message
                            }
                        }
                    }
                }
            }
        }
    }
}
