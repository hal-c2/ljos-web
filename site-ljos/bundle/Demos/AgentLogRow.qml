import Ljos.Ui
import Ljos.Core
import Ljos.Layout
import Site

// One line of the agent's log: what it said it would do (`say`), a tool
// call and what came back (`call`), the agent's edit of a file and what
// the running app made of it (`edit`: `tool` is the file, `args` the lines
// changed), something the app did that streamed back (`event`), or the
// end of the replay (`end`). Each kind has its own mark and words, so
// none is told by colour alone.
Item {
    id: line

    // A row of the stage's log model (a delegate), by its roles. `answer`: "pending",
    // "ok" or "error", or "" for what has no state: the still poster's calls.
    required property string kind
    required property string text
    required property string tool
    required property string args
    required property string summary
    required property string answer
    required property string image
    // Rise in as it is added; calm, only fade.
    property bool fresh: false
    property bool calm: false

    readonly property bool boxed: kind === "call" || kind === "edit"
    implicitHeight: boxed ? callBox.height : kind === "event" ? eventRow.height : sayRow.height
    height: implicitHeight

    opacity: 1
    transform: Translate {
        id: lift
    }
    Component.onCompleted: {
        if (!fresh)
            return;
        opacity = 0;
        lift.y = calm ? 0 : 8;
        rise.start();
    }
    ParallelAnimation {
        id: rise
        NumberAnimation {
            target: line
            property: "opacity"
            to: 1
            duration: Theme.enterPanel
            easing.type: Easing.OutCubic
        }
        NumberAnimation {
            target: lift
            property: "y"
            to: 0
            duration: Theme.enterPanel
            easing.type: Easing.OutCubic
        }
    }

    // What the agent says: its own voice, beside a small mark of it.
    Item {
        id: sayRow
        visible: line.kind === "say" || line.kind === "end"
        width: line.width
        height: sayText.height + 4

        // On the side the words start from, as they are.
        Rectangle {
            x: App.layoutDirection === Direction.RightToLeft ? sayRow.width - width : 0
            y: 7
            width: 6
            height: 6
            radius: 3
            fill: line.kind === "end" ? Theme.link : Theme.textMuted
        }
        Text {
            id: sayText
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (LayoutMirroring).
            readonly property real startX: 14
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
            width: parent.width - startX
            text: line.text
            color: line.kind === "end" ? Theme.text : Theme.textMuted
            font.family: Theme.sans
            font.size: Theme.captionSize
            font.weight: line.kind === "end" ? Font.DemiBold : Font.Normal
            lineHeightMode: Text.FixedHeight
            lineHeight: Theme.captionLine
            wrap: Text.Wrap
        }
    }

    // A call: the tool, its arguments as sent, and what came back. An
    // edit: the file, the lines it changed, and what the app did with it.
    Rectangle {
        id: callBox
        visible: line.boxed
        width: line.width
        height: callColumn.height + 2 * Theme.xs
        radius: Theme.radiusSmall
        fill: Theme.codeBg
        border.color: line.answer === "error" ? Theme.danger : Theme.divider
        border.width: 1

        Column {
            id: callColumn
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (LayoutMirroring).
            readonly property real startX: Theme.s
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
            y: Theme.xs
            width: parent.width - 2 * Theme.s
            spacing: 2

            Item {
                width: parent.width
                height: toolName.implicitHeight

                // Anchored, so a right-to-left page sets it at the right,
                // across from the answer.
                Text {
                    id: toolName
                    anchors.left: parent.left
                    text: line.tool
                    color: Theme.link
                    font.family: Theme.mono
                    font.size: Theme.captionSize
                    font.weight: Font.DemiBold
                }
                // Where the call is: on its way, answered, refused; where the
                // edit is: the app on its way to the edited module, on it,
                // or still on the last one.
                Row {
                    visible: line.answer !== ""
                    anchors.right: parent.right
                    anchors.verticalCenter: toolName.verticalCenter
                    spacing: 6

                    Rectangle {
                        Layout.alignment: Align.VCenter
                        width: 7
                        height: 7
                        radius: 3.5
                        fill: line.answer === "error" ? Theme.danger : line.answer === "ok" ? Theme.accent : "transparent"
                        border.color: line.answer === "pending" ? Theme.textMuted : "transparent"
                        border.width: 1
                    }
                    Text {
                        text: line.answer === "" ? "" : line.kind === "edit" ? (line.answer === "pending" ? t`reloading` : line.answer === "error" ? t`kept the last board` : t`reloaded`) : line.answer === "pending" ? t`sent` : line.answer === "error" ? t`refused` : t`answered`
                        color: Theme.codeGutter
                        font.family: Theme.sans
                        font.size: Theme.captionSize - 1
                    }
                }
            }
            Text {
                width: parent.width
                text: line.args
                color: Theme.codeGutter
                font.family: Theme.mono
                font.size: Theme.captionSize - 1
                lineHeightMode: Text.FixedHeight
                lineHeight: 17
                wrap: Text.WrapAnywhere
            }
            Text {
                width: parent.width
                visible: line.summary !== ""
                text: "→ " + line.summary
                color: line.answer === "error" ? Theme.danger : Theme.codeFg
                font.family: Theme.mono
                font.size: Theme.captionSize - 1
                lineHeightMode: Text.FixedHeight
                lineHeight: 17
                wrap: Text.Wrap
            }
            Image {
                visible: line.image !== ""
                source: line.image
                width: Math.min(parent.width, 220)
                height: visible && sourceSize.width > 0 ? Math.round(width * sourceSize.height / sourceSize.width) : 0
                fillMode: Image.PreserveAspectFit
            }
        }
    }

    // What the app did, streamed back through app_watch and app_logs.
    Item {
        id: eventRow
        visible: line.kind === "event"
        width: line.width
        height: eventText.height + 6

        Rectangle {
            x: App.layoutDirection === Direction.RightToLeft ? eventRow.width - width : 0
            width: 2
            height: eventRow.height
            radius: 1
            fill: Theme.link
        }
        Text {
            id: eventText
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (LayoutMirroring).
            readonly property real startX: Theme.s
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
            y: 3
            width: parent.width - startX
            text: t`app` + "  " + (line.text)
            color: Theme.text
            font.family: Theme.mono
            font.size: Theme.captionSize - 1
            lineHeightMode: Text.FixedHeight
            lineHeight: 17
            wrap: Text.Wrap
        }
    }
}
