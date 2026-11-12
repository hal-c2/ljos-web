import QtQuick
import Site

// A fenced block of a page, shown as the code it is: coloured at
// build time, in a panel of its own, under the fence's own name for
// itself.
//
// LiveCodeBlock hook: this component is where the live code-block
// lane's editor and running result plug in. It already carries the
// whole fence contract that lane reads (`lang`, the verbatim
// `code`, and `harness`/`file`/`group`/`before` where the fence
// named them, as `ljos-web/codeblocks/parse` parses them), so making
// a block live is a change inside this file — swap the static body
// for the lane's editor beside its result — and no page, block list
// or build step changes with it. Until then every block, runnable
// or exempt, reads as highlighted static code, which is also what a
// reader with no script keeps.
Column {
    id: block

    property string lang: ""
    property string code: ""
    property string rich: ""
    property string harness: ""
    property string file: ""
    property string group: ""
    property bool before: false

    width: parent ? parent.width : 640
    spacing: 0

    Rectangle {
        width: parent.width
        height: head.implicitHeight + 10
        color: Theme.panel
        border.color: Theme.border
        border.width: 1

        Text {
            id: head
            anchors.left: parent.left
            anchors.leftMargin: 10
            anchors.verticalCenter: parent.verticalCenter
            color: Theme.muted
            font.family: Theme.mono
            font.pixelSize: 11
            text: {
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
    Rectangle {
        width: parent.width
        height: body.implicitHeight + 20
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
            textFormat: Text.RichText
            wrapMode: Text.Wrap
            text: "<pre>" + block.rich + "</pre>"
        }
    }
}
