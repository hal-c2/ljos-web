import QtQuick
import Ljos.Blocks
import Site
import "../live.js" as Live
import "code-editor.js" as Editor

// A fenced block of a page. One that runs (`live` set by the build,
// docs/LJOS_WEB.md A27/A28) is the code beside its running result:
// an editor per file, and a stage the result stands in. As the page
// is first written — and for a reader with no script — the stage
// holds a picture of the result as the build prerendered it, and so
// does a browser's until the reader runs the block (a press on its
// picture, or a first edit of its code; a focus in the code fetches
// only the editor): only then is the compiler fetched, and the stage's
// ShellLoader compiles the code in the page and takes the stage over. Every edit recompiles and
// reloads with its state kept. A broken edit says why beside the
// code, and the last good result keeps running. A block that does not run is
// its code, coloured at build time, in a panel of its own.
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
    //   display: [{ name, code, lang }], picture, width, height }
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

    function apply() {
        if (!isLive || !runs)
            return;
        Live.setFiles(live.hash, display());
        if (!started) {
            started = true;
            // The source is given at once: a compile that answered
            // first would leave the stage empty until it did.
            stage.source = Live.sourceFor(live.hash);
            return;
        }
        stage.reload().then(function (why) {
            block.said = why || "";
            for (var i = 0; i < editors.count; i++)
                editors.itemAt(i).diagnostics = Live.diagnosticsFor(live.hash, i);
        });
    }

    Component.onCompleted: {
        if (!isLive)
            return;
        Live.setExample(live.hash, live.display, live.entry, live.harnessTemplate || "", live.harnessFile || "", function (lines) {
            block.absent = lines;
        });
        // Asked as the page is made, not on the first edit: where the
        // compile cannot run, the block says so before it is reached
        // for, and what it says is why, not how the compile failed.
        Live.needsWasm().then(function (why) {
            if (why) {
                block.runs = false;
                block.said = why;
            }
        });
    }

    Timer {
        id: debounce
        interval: 300
        onTriggered: block.apply()
    }

    Rectangle {
        width: parent.width
        height: headRow.implicitHeight + 10
        color: Theme.panel
        border.color: Theme.border
        border.width: 1

        Row {
            id: headRow
            anchors.left: parent.left
            anchors.leftMargin: 10
            anchors.verticalCenter: parent.verticalCenter
            spacing: 14

            Text {
                anchors.verticalCenter: parent.verticalCenter
                color: Theme.muted
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
            Item {
                visible: block.isLive
                width: resetWords.implicitWidth
                height: resetWords.implicitHeight + 4
                anchors.verticalCenter: parent.verticalCenter
                activeFocusOnTab: true
                Accessible.role: Accessible.Button
                Accessible.name: "Reset this example to as written"
                Accessible.onPressAction: () => {
                    for (var i = 0; i < editors.count; i++)
                        editors.itemAt(i).text = block.live.display[i].code;
                    block.apply();
                }
                Keys.onPressed: (event) => {
                    if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                        for (var i = 0; i < editors.count; i++)
                            editors.itemAt(i).text = block.live.display[i].code;
                        block.apply();
                        event.accepted = true;
                    }
                }

                Text {
                    id: resetWords
                    anchors.verticalCenter: parent.verticalCenter
                    text: "Reset"
                    color: Theme.accent
                    font.family: Theme.sans
                    font.pixelSize: 12
                }
                MouseArea {
                    anchors.fill: parent
                    Accessible.ignored: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: {
                        for (var i = 0; i < editors.count; i++)
                            editors.itemAt(i).text = block.live.display[i].code;
                        block.apply();
                    }
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
        border.color: Theme.border
        border.width: 1

        Text {
            id: body
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.margins: 10
            color: Theme.ink
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
            visible: block.isLive && block.live.display.length > 1
            spacing: 6

            Repeater {
                model: block.isLive ? block.live.display : []

                Rectangle {
                    required property var modelData
                    required property int index

                    width: tabWords.implicitWidth + 16
                    height: tabWords.implicitHeight + 8
                    color: index === block.currentFile ? Theme.codeBg : Theme.panel
                    border.color: Theme.border
                    border.width: 1
                    activeFocusOnTab: true
                    Accessible.role: Accessible.Button
                    Accessible.name: "Edit " + modelData.name
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
                        color: Theme.ink
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
            width: parent.width
            height: editorBox.implicitHeight
            color: Theme.codeBg
            border.color: Theme.border
            border.width: 1

            Column {
                id: editorBox
                width: parent.width

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
                        onTextChanged: if (block.started || text !== code) debounce.restart()
                    }
                }
            }
        }

        // The stage: the picture the build drew of the result,
        // and the running result over it once compiled. The
        // picture is an <img> in rich text, not an Image: an
        // Image paints only when its page runs, and this stage
        // is exactly what a reader without script is shown — the
        // picture must stand in the HTML as written.
        Item {
            id: stageBox
            width: parent.width
            readonly property int pictureWidth: block.isLive ? Math.min(block.live.width, width) : 0
            readonly property int pictureHeight: block.isLive && block.live.width > 0 ? pictureWidth * block.live.height / block.live.width : 0
            height: Math.max(pictureHeight, stage.implicitHeight)

            Text {
                // Until the result runs: before the reader reaches for
                // the block, while the code compiles (status Null),
                // and always where there is no compiler (`runs`).
                visible: block.isLive && (!block.runs || !block.started || !stage.item || stage.status === ShellLoader.Null)
                textFormat: Text.RichText
                text: block.isLive ? "<img src=\"" + block.live.picture + "\" width=\"" + stageBox.pictureWidth + "\" height=\"" + Math.round(stageBox.pictureHeight) + "\" alt=\"What this example draws\">" : ""
            }
            // A press on the picture runs what it is a picture of, where it can run.
            MouseArea {
                visible: block.isLive && block.runs && !block.started
                width: stageBox.pictureWidth
                height: stageBox.pictureHeight
                Accessible.ignored: true
                cursorShape: Qt.PointingHandCursor
                onPressed: block.apply()
            }
            ShellLoader {
                id: stage
                width: stageBox.pictureWidth
                height: Math.max(stageBox.pictureHeight, implicitHeight)
                fallback: emptyStage
            }
            Component {
                id: emptyStage
                Item {}
            }
        }

        Text {
            id: told
            visible: text !== ""
            width: parent.width
            text: [block.said || stage.error, block.absent].filter(function (line) { return line !== ""; }).join("\n")
            color: Theme.accent
            font.family: Theme.mono
            font.pixelSize: 12
            wrapMode: Text.Wrap
        }
    }
}
