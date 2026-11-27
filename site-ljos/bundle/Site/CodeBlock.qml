pragma Scripts: JavaScript
import Ljos.Core
import Ljos.Ui
import Ljos.Layout
import QtQuick as Q
import Ljos.Blocks
import Site
import "../live.js" as Live
import "../nav.js" as Nav
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
    // Code is read from the left in every language, and so is the block
    // it stands in, with the result its code makes beside it, on a page
    // that runs from the right too.
    LayoutMirroring.enabled: false
    LayoutMirroring.childrenInherit: true

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
    readonly property int inset: phone ? Theme.s : Theme.m
    // A phone shows what an example does before how: its stage comes
    // first, and code longer than a screenful folds after its first
    // dozen lines until the reader asks for all of it. Code a few lines
    // over the dozen is shown whole: folding it would hide less than
    // the button to unfold it takes.
    readonly property bool phone: width < 480
    // A live block's editors, stage and its runner, and the Run button:
    // made only for a live block (liveArea), so null on a plain one.
    readonly property Item parts: liveArea.item
    readonly property int foldAt: 12
    readonly property int codeLines: String(isLive ? live.display[currentFile].code : code).replace(/\n$/, "").split("\n").length
    property bool showsAll: false
    readonly property bool foldable: phone && codeLines > foldAt + 3
    // Whether any of its files is long enough to fold on a phone: the
    // way to fold is made only then (foldBar), whatever the width and
    // whichever file is shown, so a turned phone or a tab never takes
    // it away from under the reader's focus.
    readonly property bool mayFold: (isLive ? live.display.map((file) => file.code) : [code]).some((text) => String(text).replace(/\n$/, "").split("\n").length > foldAt + 3)
    readonly property bool folded: foldable && !showsAll
    // What the page scrolls in, so Show less can keep itself in view.
    property var scroller: null
    // The height folded code shows: its first dozen lines and the
    // space above them.
    readonly property int foldedHeight: Theme.s + foldAt * Theme.codeLine
    // In the page as written Show all has no script to run, so the fold
    // scrolls to the rest at the same height. Once the page runs it
    // doesn't: Show all is the way, and a finger moves the page.
    readonly property bool scrollsFolded: folded && !Nav.inBrowser()
    // A reader who goes into the code has all of it, and keeps it.
    onEditingChanged: if (editing) setFold(true)
    // Only a fold the reader asks for moves. One the card is laid out
    // with (as it is first drawn, or narrows to a phone) is there at
    // once, so the page the build writes has folded code at its height.
    Timer {
        id: folding
        interval: Theme.enterPanel
    }
    function setFold(all) {
        if (all === showsAll)
            return;
        // First: a Behavior reads whether it is enabled as it is written to.
        if (phone)
            folding.restart();
        showsAll = all;
    }
    // Unfolding, for a reader who asked for less movement: the code
    // stands at its whole height at once, and the lines it brings fade
    // in rather than slide.
    onShowsAllChanged: if (showsAll && phone && Theme.calm) unfoldFade.restart()
    ParallelAnimation {
        id: unfoldFade
        NumberAnimation { target: body; property: "opacity"; from: 0.4; to: 1; duration: Theme.enterPanel; easing.type: Easing.OutCubic }
        NumberAnimation { target: block.parts ? block.parts.editorBox : null; property: "opacity"; from: 0.4; to: 1; duration: Theme.enterPanel; easing.type: Easing.OutCubic }
    }

    width: parent ? parent.width : 640
    spacing: 0

    function display() {
        var files = [];
        var editors = parts ? parts.editors : null;
        for (var i = 0; editors && i < editors.count; i++) {
            var area = editors.itemAt(i);
            files.push({ "name": live.display[i].name, "code": area ? area.text : live.display[i].code, "lang": live.display[i].lang });
        }
        return files;
    }

    function recheck() {
        var changed = false;
        // An editor's first text comes as the parts are made, before
        // `parts` is set: there is nothing edited yet.
        var editors = parts ? parts.editors : null;
        for (var i = 0; editors && i < editors.count; i++) {
            var area = editors.itemAt(i);
            if (area && area.text !== live.display[i].code)
                changed = true;
        }
        edited = changed;
    }

    function reset() {
        var editors = parts.editors;
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
        var root = isLive && parts ? parts.stage.item : null;
        declaredNames = root ? Observed.shown(root) : [];
        if (root)
            disconnect = Observed.connectSignals(block.key, root);
        // The Observer on it follows it made again, and closes with it.
        Observing.retarget(block.key, root);
    }

    function toggleObserver() {
        Observing.toggle(block.key, parts.stage.item, Observed.logSource(block.key), fileName);
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
            parts.runner.ask();
            return;
        }
        parts.stage.reload().then(function (why) {
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
        var editors = parts.editors;
        for (var i = 0; i < editors.count; i++)
            editors.itemAt(i).diagnostics = [];
        parts.stage.source = Live.sourceFor(block.key);
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
        parts.stage.source = "";
        Observed.reset(block.key, live.logged || []);
    }
    // The editors' marks, from the compile the stage last took.
    function marked() {
        var editors = parts ? parts.editors : null;
        for (var i = 0; editors && i < editors.count; i++)
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
        // The other frameworks' own languages, as the review shows them.
        case "slint":
            return "Slint";
        case "dart":
            return "Dart";
        case "cpp":
        case "c++":
            return "C++";
        case "tsx":
            return "TSX";
        case "declare":
            return "Declare";
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
        var area = parts ? parts.editors.itemAt(currentFile) : null;
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
        fill: Theme.codeBg
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
                fill: Theme.surface

                Flow {
                    id: named
                    x: block.inset
                    y: Math.round((head.height - height) / 2)
                    width: head.width - x - copyButton.width - Theme.xs - Theme.s
                    spacing: Theme.xs

                    // A live block of several files: a tab each, which
                    // name the files; of one, its name.
                    // More files than the head has room for scroll in it,
                    // never under Copy.
                    Flickable {
                        id: tabsView
                        visible: block.isLive && block.sourceShown && block.live.display.length > 1
                        width: Math.min(tabRow.implicitWidth, named.width)
                        height: 32
                        contentWidth: tabRow.implicitWidth
                        contentHeight: height
                        flickableDirection: Flickable.HorizontalFlick
                        boundsBehavior: Flickable.StopAtBounds
                        acceptedButtons: MouseButton.None
                        clip: true

                        Row {
                            id: tabRow
                            // What holds the tabs, so a reader hears them as one set.
                            Accessible.role: Accessible.PageTabList

                            Repeater {
                                model: block.isLive ? block.live.display : []

                                Item {
                                    id: tab
                                    required property var modelData
                                    required property int index
                                    readonly property bool current: index === block.currentFile

                                    // A name too long for the strip is cut in its middle,
                                    // so the tab fits and its end (.qml) still shows;
                                    // a reader still hears the whole name.
                                    width: Math.min(tabWords.implicitWidth + 2 * Theme.xs, named.width)
                                    height: 32
                                    activeFocusOnTab: true
                                    // The tab with the keyboard is never out of the strip.
                                    onActiveFocusChanged: if (activeFocus) tabsView.contentX = Math.min(x, Math.max(tabsView.contentX, x + width - tabsView.width))
                                    // A tab, named by its file: the toolbar's Edit is
                                    // the one that says "Edit".
                                    Accessible.role: Accessible.PageTab
                                    Accessible.name: modelData.name
                                    Accessible.selected: current
                                    Accessible.onPressAction: () => block.currentFile = index
                                    Keys.onPressed: (event) => {
                                        if (event.key === Key.Return || event.key === Key.Enter || event.key === Key.Space) {
                                            block.currentFile = index;
                                            event.accepted = true;
                                        }
                                    }

                                    Text {
                                        id: tabWords
                                        anchors.centerIn: parent
                                        width: Math.min(implicitWidth, tab.width - 2 * Theme.xs)
                                        elide: Text.ElideMiddle
                                        text: tab.modelData.name
                                        color: tab.current ? Theme.text : Theme.textMuted
                                        font.family: Theme.mono
                                        font.size: Theme.captionSize
                                        font.weight: tab.current ? Font.DemiBold : Font.Normal
                                    }
                                    // The file shown: underlined in the accent.
                                    Rectangle {
                                        visible: tab.current
                                        anchors.bottom: parent.bottom
                                        width: parent.width
                                        height: 2
                                        radius: 1
                                        fill: Theme.accent
                                    }
                                    Rectangle {
                                        visible: tab.activeFocus
                                        anchors.fill: parent
                                        radius: Theme.radiusSmall
                                        fill: "transparent"
                                        border.color: Theme.focusRing
                                        border.width: 2
                                    }
                                    PointerArea {
                                        anchors.fill: parent
                                        Accessible.ignored: true
                                        cursorShape: Cursor.PointingHand
                                        onClicked: block.currentFile = tab.index
                                    }
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
                        font.size: Theme.captionSize
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
                                fill: Theme.surfaceSelected

                                Text {
                                    id: chipWords
                                    anchors.centerIn: parent
                                    text: modelData
                                    color: Theme.text
                                    font.family: Theme.sans
                                    font.size: Theme.captionSize
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
                        font.size: Theme.captionSize
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
                fill: Theme.divider
            }

            // Plain code: highlighted at build time, as written, every
            // line whole. A line wider than the card scrolls inside it
            // (a wheel, a finger, the keyboard), never the page; a press
            // and drag selects, as it does in any text.
            Flickable {
                id: plainScroll
                visible: !block.isLive
                width: parent.width
                height: visible ? (block.folded ? block.foldedHeight : body.height + 2 * Theme.s) : 0

                // Unfolding grows the code to its whole height, for a
                // reader who has not asked for less movement; never as the
                // reader types, when each line comes at once.
                Behavior on height {
                    enabled: folding.running && !Theme.calm
                    NumberAnimation { duration: Theme.enterPanel; easing.type: Easing.OutCubic }
                }
                contentWidth: Math.max(width, body.implicitWidth + 2 * block.inset)
                contentHeight: block.scrollsFolded ? body.height + 2 * Theme.s : height
                flickableDirection: block.scrollsFolded ? Flickable.AutoFlickIfNeeded : Flickable.HorizontalFlick
                boundsBehavior: Flickable.StopAtBounds
                acceptedButtons: MouseButton.None
                clip: true

                Text {
                    id: body
                    x: block.inset
                    y: Theme.s
                    color: Theme.codeFg
                    font.family: Theme.mono
                    font.size: Theme.codeSize
                    // As a live block's editor sets its lines (CodeEditor): a
                    // height the build and the browser agree on.
                    lineHeightMode: Text.FixedHeight
                    lineHeight: Theme.codeLine
                    format: Text.RichText
                    wrap: Text.NoWrap
                    // The colouring (packed by the build) as rich text
                    // shows it: lines are breaks, and every space stays.
                    text: Editor.shownAs(block.rich, block.code, block.code)
                }
            }

            // Live: the editor (one file at a time, tabs in the head where
            // there are several), the toolbar, then the stage; on a phone
            // the other way up, the stage first. Only a live block has these: a page writes every item it has,
            // shown or not, and a plain card holding a hidden editor, toolbar
            // and stage came to most of /start/cli/'s first load. What the
            // block reaches in them, it reaches through `parts`.
            Loader {
                id: liveArea
                active: block.isLive
                visible: block.isLive
                width: parent.width
                component: Item {
                    property alias editors: editors
                    property alias editorBox: editorBox
                    property alias stage: stage
                    property alias runner: runner
                    property alias runButton: runButton
                    width: liveArea.width
                    height: codePart.height + toolbarPart.height + stagePart.height

                        // The page and Tab go in the order the parts are declared
                        // in, whatever their y, so a phone has the stage and its
                        // toolbar in places of their own before the code. The code
                        // stays put: moving it would drop the editor's focus.
                        Item {
                            id: stageAbove
                            width: parent.width
                            height: block.phone ? stagePart.height : 0
                        }
                        Item {
                            id: barAbove
                            y: stageAbove.height
                            width: parent.width
                            height: block.phone ? toolbarPart.height : 0
                        }

                        Column {
                            id: codePart
                            width: parent.width
                            y: stageAbove.height + barAbove.height

                            // The editor's box, which rings while the reader is in it.
                            Rectangle {
                                visible: block.sourceShown
                                width: parent.width
                                height: visible ? (block.folded ? block.foldedHeight : editorScroll.height) : 0
                                clip: true

                                // Unfolding grows the code to its whole height, for a
                                // reader who has not asked for less movement; never as the
                                // reader types, when each line comes at once.
                                Behavior on height {
                                    enabled: folding.running && !Theme.calm
                                    NumberAnimation { duration: Theme.enterPanel; easing.type: Easing.OutCubic }
                                }
                                fill: Theme.codeBg
                                border.color: Theme.focusRing
                                border.width: block.editing ? 2 : 0

                                Flickable {
                                    id: editorScroll
                                    width: parent.width
                                    height: block.scrollsFolded ? block.foldedHeight : editorBox.height
                                    contentWidth: Math.max(width, editorBox.implicitWidth)
                                    contentHeight: editorBox.height
                                    flickableDirection: block.scrollsFolded ? Flickable.AutoFlickIfNeeded : Flickable.HorizontalFlick
                                    boundsBehavior: Flickable.StopAtBounds
                                    acceptedButtons: MouseButton.None
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
                                                label: t`Edit ${modelData.name}`
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
                        }

                        Item {
                            id: barBelow
                            y: codePart.y + codePart.height
                            width: parent.width
                            height: block.phone ? 0 : toolbarPart.height
                        }
                        Item {
                            id: stageBelow
                            y: barBelow.y + barBelow.height
                            width: parent.width
                            height: block.phone ? 0 : stagePart.height
                        }

                        Column {
                            id: toolbarPart
                            parent: block.phone ? barAbove : barBelow
                            width: parent.width

                            // The hairline toward the code, which is there only while
                            // the code is.
                            Rectangle {
                                visible: block.phone || block.sourceShown
                                width: parent.width
                                height: visible ? 1 : 0
                                fill: Theme.divider
                            }

                            // The stage's toolbar: what the reader can do with it, never
                            // over what it draws.
                            Rectangle {
                                objectName: "codeToolbar"
                                width: parent.width
                                height: Math.max(48, controls.height + 2 * Theme.xs)
                                fill: Theme.surface

                                // On a narrow phone the controls wrap, beside the word
                                // that says the code is edited and never under it.
                                Flow {
                                    id: controls
                                    width: parent.width - 2 * block.inset - (block.edited ? editedBadge.width + Theme.xs : 0)
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
                                    id: editedBadge
                                    objectName: "editedBadge"
                                    visible: block.edited
                                    anchors.right: parent.right
                                    anchors.rightMargin: block.inset
                                    anchors.verticalCenter: parent.verticalCenter
                                    width: editedWords.implicitWidth + 2 * Theme.xs
                                    height: editedWords.implicitHeight + Theme.xxs
                                    radius: height / 2
                                    fill: Theme.surfaceSelected
                                    Text {
                                        id: editedWords
                                        anchors.centerIn: parent
                                        text: t`Edited`
                                        color: Theme.text
                                        font.family: Theme.sans
                                        font.size: Theme.captionSize
                                    }
                                }
                            }
                            Rectangle {
                                visible: !block.phone || block.sourceShown
                                width: parent.width
                                height: visible ? 1 : 0
                                fill: Theme.divider
                            }
                        }

                        Column {
                            id: stagePart
                            parent: block.phone ? stageAbove : stageBelow
                            width: parent.width

                            // The stage: a ground of the page's with the example's window
                            // on it. In the window, the picture the build drew of the
                            // result, and the running result over it once compiled. The
                            // picture is an <img> in rich text, not an Image: an Image
                            // paints only when its page runs, and this stage is exactly
                            // what a reader without script is shown — the picture must
                            // stand in the HTML as written.
                            Rectangle {
                                id: stageBox
                                // Named so a check finds the stage from its picture
                                // at any depth: the dark scheme's is a Loader deeper.
                                objectName: "codeStage"
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
                                // Lazy, as the page has both schemes' pictures and the
                                // one that is hidden is not laid out: it is fetched
                                // when the reader's theme shows it.
                                function pictureOf(src) {
                                    return "<img loading=\"lazy\" src=\"" + src + "\" width=\"" + pictureWidth + "\" height=\"" + Math.round(pictureHeight) + "\" alt=\"What this example draws\">";
                                }
                                height: frame.height + 2 * pad
                                fill: Theme.stage

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
                                    fill: runner.hovered ? Theme.accent : Theme.stageEdge

                                    Behavior on fill {
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
                                    fill: Theme.paper
                                    clip: true

                                    Text {
                                        // Until the result runs (Ready): before the reader
                                        // reaches for the block, while its code compiles,
                                        // after a first edit that did not compile (the empty
                                        // fallback stands, status Fallback), and always where
                                        // there is no compiler. Once Ready a failed edit
                                        // keeps the last good result, so the picture never
                                        // comes back over it. Each scheme has its own
                                        // picture, drawn from the example as it runs in
                                        // that scheme: the dark page's window holds the
                                        // app in the dark, never a light card on it. Two
                                        // items, not one whose source changes: the page's
                                        // two renders then differ only in which is shown,
                                        // and share one tree.
                                        visible: block.isLive && stage.status !== ShellLoader.Ready && !(Theme.dark && block.live.pictureDark)
                                        x: frame.appX
                                        y: frame.appY
                                        format: Text.RichText
                                        text: block.isLive ? stageBox.pictureOf(block.live.picture) : ""
                                    }
                                    // The dark scheme's picture, and below the words for a
                                    // window with nothing drawn yet, are made only for a
                                    // block that has them. A page writes every item it
                                    // has, shown or not, and a page of plain code has
                                    // dozens of cards: these items in each of them came to
                                    // 2 kB of its first load. Each Loader is hidden while
                                    // what it holds is, so the window's first shown child
                                    // is still what it shows.
                                    Loader {
                                        active: block.isLive && !!block.live.pictureDark
                                        visible: active && stage.status !== ShellLoader.Ready && Theme.dark
                                        component: Text {
                                            x: frame.appX
                                            y: frame.appY
                                            format: Text.RichText
                                            text: stageBox.pictureOf(block.live.pictureDark)
                                        }
                                    }
                                    // An example that draws nothing in this scheme before
                                    // the reader runs it (its point is what it says, or it
                                    // waits for a press) says so, rather than show an empty
                                    // window that reads as one that failed. Its picture may
                                    // still have a ground of its own (a bare Window's white,
                                    // in the dark too): the paper covers it, and the words
                                    // read in the scheme's colours.
                                    Loader {
                                        anchors.fill: parent
                                        active: block.isLive && (!!block.live.blank || !!block.live.blankDark)
                                        visible: active && !!(Theme.dark ? block.live.blankDark : block.live.blank) && stage.status !== ShellLoader.Ready
                                        component: Rectangle {
                                            radius: frame.radius
                                            fill: Theme.paper

                                            Text {
                                                x: Theme.s
                                                width: frame.width - 2 * Theme.s
                                                anchors.verticalCenter: parent.verticalCenter
                                                align: Text.AlignHCenter
                                                wrap: Text.Wrap
                                                // It asks for a Run only where there is one to press.
                                                text: runner.phase === "picture" ? t`Nothing drawn yet. Run it to see what it does.` : t`Nothing drawn yet.`
                                                color: Theme.textMuted
                                                font.family: Theme.sans
                                                font.size: Theme.captionSize
                                                lineHeight: Theme.captionLine
                                                lineHeightMode: Text.FixedHeight
                                            }
                                        }
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
                                    Q.WindowContainer {
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
                                fill: Theme.surface

                                Text {
                                    id: told
                                    x: block.inset
                                    y: Theme.xs
                                    width: parent.width - 2 * block.inset
                                    text: [block.said || stage.error, block.absent].filter(function (line) { return line !== ""; }).join("\n")
                                    color: Theme.danger
                                    font.family: Theme.mono
                                    font.size: Theme.captionSize
                                    lineHeight: Theme.captionLine
                                    lineHeightMode: Text.FixedHeight
                                    wrap: Text.Wrap
                                }
                            }

                            // What it says of itself: none of it until there is some.
                            Rectangle {
                                id: values
                                visible: block.isLive && (block.declaredNames.length > 0 || block.lines.length > 0)
                                width: parent.width
                                height: visible ? valuesColumn.implicitHeight + 2 * Theme.xs + 1 : 0
                                fill: Theme.surface
                                Accessible.role: Accessible.Grouping
                                Accessible.name: t`Values`

                                Rectangle {
                                    width: parent.width
                                    height: 1
                                    fill: Theme.divider
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
                                            font.size: Theme.captionSize
                                            font.weight: Font.DemiBold
                                        }
                                        Repeater {
                                            model: block.declaredNames

                                            Text {
                                                required property string modelData
                                                color: Theme.text
                                                font.family: Theme.mono
                                                font.size: Theme.captionSize
                                                text: modelData + ": " + Observed.show(stage.item ? stage.item[modelData] : undefined)
                                            }
                                        }
                                    }
                                    Repeater {
                                        model: block.lines

                                        Text {
                                            required property var modelData
                                            width: valuesColumn.width
                                            wrap: Text.Wrap
                                            color: modelData.level === "warn" || modelData.level === "error" ? Theme.danger : modelData.level === "signal" ? Theme.link : Theme.text
                                            font.family: Theme.mono
                                            font.size: Theme.captionSize
                                            text: (modelData.level === "signal" ? "↯ " : "› ") + modelData.message
                                        }
                                    }
                                }
                            }
                        }
                }
            }

            // The way to all of long code and back, under the code: one
            // button, so the focus a keyboard reader gave it stays.
            // Written only for code that can fold: a page writes every item it
            // has, and most code is short.
            Loader {
                active: block.mayFold
                width: parent.width
                component: Rectangle {
                    id: foldBar
                    visible: block.foldable && (!block.isLive || block.sourceShown)
                    // The fold goes when the card widens past a phone's (a phone
                    // turned, a window made wider), and a focus left on its
                    // hidden button reaches nothing a reader sees. It goes to
                    // what is under the code once the fold has gone: the
                    // toolbar's first button, or Copy where nothing runs.
                    onVisibleChanged: {
                        if (!visible && foldButton.activeFocus)
                            (block.parts && block.parts.runButton.visible ? block.parts.runButton : copyButton).forceActiveFocus();
                    }
                    // Folding, the code shrinks above the button, which would
                    // go up out of the view with the reader's focus on it.
                    onYChanged: {
                        if (!block.scroller || block.showsAll || !folding.running)
                            return;
                        var top = foldBar.mapToItem(block.scroller.contentItem, 0, 0).y - Theme.s;
                        if (top < block.scroller.contentY)
                            block.scroller.contentY = Math.max(0, top);
                    }
                    width: parent.width
                    height: visible ? 48 : 0
                    fill: Theme.codeBg

                    Rectangle {
                        width: parent.width
                        height: 1
                        fill: Theme.divider
                    }
                    StageButton {
                        id: foldButton
                        anchors.left: parent.left
                        anchors.leftMargin: block.inset
                        anchors.verticalCenter: parent.verticalCenter
                        text: block.showsAll ? t`Show less` : t`Show all ${plural(block.codeLines, { one: "# line", other: "# lines" })}`
                        label: block.showsAll ? t`Show less of ${block.title}` : t`Show all ${plural(block.codeLines, { one: "# line", other: "# lines" })} of ${block.title}`
                        onPressed: {
                            // Folded code takes no keys.
                            if (block.editing)
                                foldButton.forceActiveFocus();
                            block.setFold(!block.showsAll);
                        }
                    }
                }
            }
        }
    }
}
