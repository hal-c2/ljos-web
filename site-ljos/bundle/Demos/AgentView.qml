// Ljós's Core before QtQuick: only its t`` is wanted here, and any name
// both have stays QtQuick's, the later import.
import Ljos.Core
import QtQuick
import Ljos.Blocks
import Site
import Demos
import "../Site/code-editor.js" as Editor
import "boards.js" as Boards
import "logic/before/board.ts" as ListBoard
import "logic/after/board.ts" as LanesBoard

// What the agent replay looks like: a toolbar with the request, in words,
// how it stands and the same change in the reader's hands; under that the
// dispatch app, and beside it (under it, when narrow) the TypeScript the
// running app was built from, the log of the agent's calls or a small
// Observer. The app is one of two modules, DispatchList or DispatchBoard,
// each built from its own board.ts, in a loader: a reload of it puts the
// other in, keeping what the app was given. It only draws: the live stage
// (AgentStage) sends the calls, swaps the module and fills the log, and a
// poster fills it once, still. That it is a replay, and its
// one button, are the frame's to draw in that toolbar (ReplayFrame):
// one of each, whichever of stage and poster stands.
Rectangle {
    id: view

    // Tabs for the source, the log and the Observer; without them, the log.
    property bool tabs: true
    // "source", "agent" or "observer".
    property string tab: tabs ? "source" : "agent"
    // Steps done and how many there are.
    property int at: 0
    property int total: 0
    property bool playing: false
    // A step of the replay is on its way or due.
    property bool working: false
    // The layout shown is the reader's own.
    property bool edited: false
    // Not at the board: calls follow it, and "Done" reads as finished. Nor
    // ever a poster's: it shows the end, and nothing was run to reach it.
    readonly property bool finished: !still && total > 0 && at >= total && card !== null && card.layout === "board"
    property bool calm: false
    // A poster: nothing moves, and only the layout can be changed.
    property bool still: false
    property bool editable: !still
    // The small Observer's tree (Stage.treeRows) and the picked object's
    // properties (Stage.propertyRows).
    property var treeRows: []
    property var propertyRows: []
    property string pickedRef: ""

    // The app, once its loader has made it.
    readonly property var card: shell.item
    readonly property alias log: logModel
    // The module the loader is asked for: "list" or "board".
    property string wanted: still ? "board" : "list"
    // The module the running app was made by, as it says: the code shown
    // is the file that one was built from, also when a swap failed.
    readonly property string running: card !== null && card.layout !== "" ? card.layout : wanted
    // How many swaps have been made: from the first on, the code marks the
    // lines the edit changed.
    property int swaps: 0

    // The other module in place of the running one, by a reload that
    // carries what the app was given. A poster's loader shows its board
    // until the first, which gives it its source. Answers why it failed,
    // or "", or null where nothing was reloaded.
    function swap(layout) {
        wanted = layout;
        if (!shell.source) {
            shell.source = Boards.sourceFor(view);
            swaps += 1;
            return null;
        }
        return shell.reload().then((why) => {
            if (!why)
                view.swaps += 1;
            return why;
        });
    }
    Component.onCompleted: {
        if (!still)
            shell.source = Boards.sourceFor(view);
    }

    signal tabPicked(string tab)
    signal layoutPicked(string layout)
    signal treePicked(string ref)

    // Side by side only where the card keeps its filters by its heading
    // and the code its 14 pixels.
    readonly property int sideWidth: 358
    readonly property bool wide: width >= sideWidth + 360 + gap + 2 * pad
    // The toolbar on two rows, else three. The frame lays its button at the
    // end of the first (actWidth) and its label at the end of the second.
    readonly property bool roomy: width >= 600
    readonly property int actWidth: 104
    // DECISION: the app's border is as tall as what it shows, and the room
    // under it is held for the tallest its buttons reach, as `rooms` measures
    // them all at this width and in these fonts, so neither the page nor the
    // code under it moves.
    readonly property int cardRoom: Math.ceil(Math.max(card !== null ? card.implicitHeight : 0, rooms.implicitHeight))
    readonly property int sideRoom: 432
    // On a phone the code is a scroll away: the lines the edit is about
    // stand above the app, in a strip as high as two.
    readonly property int codeStrip: wide ? 0 : 48
    implicitHeight: strip.height + codeStrip + pad + (wide ? Math.max(cardRoom, sideRoom) : cardRoom + gap + sideRoom)
    // Room for a focus ring at the edges, and no more: the app is the subject.
    readonly property int pad: Theme.xxs
    readonly property int gap: Theme.s

    color: Theme.canvas

    ListModel {
        id: logModel
    }

    // Above it, at every width and in every tab, the one toolbar: what the
    // agent was asked, how that stands, the same change in the reader's own
    // hands, and the room for the frame's label and button.
    Item {
        id: strip
        width: view.width
        height: view.roomy ? 76 : 112

        Text {
            id: request
            x: view.pad
            y: Theme.xxs + Math.round((editButtons.height - height) / 2)
            width: (view.roomy ? editButtons.x : strip.width - view.pad - view.actWidth) - x - Theme.xs
            text: t`Agent: make this a board`
            color: Theme.text
            font.family: Theme.sans
            font.pixelSize: Theme.bodySize
            font.weight: Font.DemiBold
            wrapMode: Text.Wrap
        }
        Row {
            id: editButtons
            x: view.roomy ? strip.width - view.pad - view.actWidth - Theme.xs - width : view.pad
            y: view.roomy ? Theme.xxs : 40
            spacing: Theme.xxs
            enabled: view.editable

            StageButton {
                text: t`List`
                label: t`List layout`
                checkable: true
                checked: view.running === "list"
                onPressed: view.layoutPicked("list")
            }
            StageButton {
                text: t`Board`
                label: t`Board layout`
                checkable: true
                checked: view.running === "board"
                onPressed: view.layoutPicked("board")
            }
        }
        // At the end the next step: the card's own button is the one in the
        // accent, so it and these words are what is seen to press.
        Text {
            x: view.pad
            y: view.roomy ? 48 : 76
            width: strip.width - 2 * view.pad - (view.roomy ? 176 : 0)
            text: view.edited ? t`Your edit` : view.still ? t`End result, not run` : view.finished ? (card !== null && card.unassigned > 0 ? t`Done. Try Assign crew or List / Board.` : t`Done`) : view.working ? t`Working…` : ""
            color: Theme.link
            font.family: Theme.sans
            font.pixelSize: Theme.captionSize
            font.weight: Font.DemiBold
            wrapMode: Text.Wrap
        }
    }

    // The phone's strip of code: the edited lines of the file the running
    // app was built from, with their lines in it.
    Rectangle {
        id: phoneCode
        objectName: "boardStrip"
        visible: !view.wide
        x: view.pad
        y: strip.height
        width: view.width - 2 * view.pad
        height: view.codeStrip - Theme.xxs
        radius: Theme.radiusSmall
        color: Theme.codeBg

        Column {
            x: Theme.xs
            y: Math.round((parent.height - height) / 2)
            width: parent.width - 2 * Theme.xs

            Repeater {
                model: view.wide ? [] : DispatchSource[view.running].strip
                Row {
                    required property var modelData
                    spacing: Theme.xs
                    Text {
                        width: 20
                        horizontalAlignment: Text.AlignRight
                        text: String(parent.modelData.line)
                        color: Theme.codeGutter
                        font.family: Theme.mono
                        font.pixelSize: Theme.captionSize - 1
                        lineHeightMode: Text.FixedHeight
                        lineHeight: 20
                    }
                    Text {
                        width: phoneCode.width - 2 * Theme.xs - 20 - Theme.xs
                        text: parent.modelData.text
                        color: Theme.codeFg
                        font.family: Theme.mono
                        font.pixelSize: Theme.captionSize - 1
                        lineHeightMode: Text.FixedHeight
                        lineHeight: 20
                        elide: Text.ElideRight
                    }
                }
            }
        }
    }

    // The app: the one frame here, made by the module the loader holds.
    ShellLoader {
        id: shell
        x: view.pad
        y: strip.height + view.codeStrip
        width: view.wide ? view.width - 2 * view.pad - view.gap - view.sideWidth : view.width - 2 * view.pad
        // A poster's board is drawn with the page: the board module, still.
        fallback: view.still ? posterBoard : undefined
        onItemChanged: {
            if (item)
                item.still = Qt.binding(() => view.still);
        }
    }
    Component {
        id: posterBoard
        DispatchBoard {
            still: true
        }
    }

    // The card in each state it can reach, never shown and only measured:
    // which is the tallest goes with the width and the fonts, as a lane alone
    // is wider. An item an ancestor hides keeps its place, so a Row of them
    // is as tall as the tallest would be shown.
    Row {
        id: rooms
        objectName: "dispatchRoom"
        visible: false

        Repeater {
            model: AgentReplay.reachable
            DispatchCard {
                required property var modelData
                width: shell.width
                still: true
                heading: AgentReplay.heading
                filters: AgentReplay.filters
                tickets: AgentReplay.tickets
                crews: modelData.crews
                layout: modelData.layout
                lay: modelData.layout === "board" ? LanesBoard.lanes : ListBoard.lanes
                openOnly: modelData.openOnly
            }
        }
    }

    // The log, the source or the Observer.
    Item {
        id: side
        x: view.wide ? shell.x + shell.width + view.gap : view.pad
        y: view.wide ? strip.height : strip.height + view.codeStrip + view.cardRoom + view.gap
        width: view.wide ? view.sideWidth : view.width - 2 * view.pad
        height: view.height - y - view.pad
        clip: true

        // Its tabs, or its title.
        Item {
            id: head
            width: parent.width
            height: 44

            Row {
                id: tabRow
                visible: view.tabs
                Accessible.role: Accessible.PageTabList
                Accessible.name: t`Replay views`
                x: 2
                anchors.verticalCenter: parent.verticalCenter
                spacing: 2

                Repeater {
                    model: view.tabs ? [{ key: "source", name: t`TypeScript` }, { key: "agent", name: t`Agent` }, { key: "observer", name: t`Observer` }] : []
                    Rectangle {
                        id: tabButton
                        required property var modelData
                        readonly property bool current: view.tab === modelData.key
                        width: tabWords.implicitWidth + 2 * Theme.xs
                        height: 30
                        radius: Theme.radiusSmall
                        color: current ? Theme.surfaceSelected : tabHit.containsMouse && !view.still ? Theme.surfaceHover : "transparent"
                        activeFocusOnTab: !view.still
                        Accessible.role: Accessible.PageTab
                        Accessible.name: modelData.name
                        Accessible.selected: current
                        Keys.onPressed: (event) => {
                            if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                                view.tabPicked(tabButton.modelData.key);
                                event.accepted = true;
                            }
                        }
                        Behavior on color {
                            ColorAnimation {
                                duration: Theme.moveSmall
                            }
                        }
                        Text {
                            id: tabWords
                            anchors.centerIn: parent
                            text: tabButton.modelData.name
                            color: tabButton.current ? Theme.text : Theme.textMuted
                            font.family: Theme.sans
                            font.pixelSize: Theme.captionSize
                            font.weight: tabButton.current ? Font.DemiBold : Font.Normal
                        }
                        Rectangle {
                            visible: tabButton.activeFocus
                            anchors.fill: parent
                            anchors.margins: -2
                            radius: parent.radius + 2
                            color: "transparent"
                            border.color: Theme.focusRing
                            border.width: 2
                        }
                        MouseArea {
                            id: tabHit
                            anchors.fill: parent
                            hoverEnabled: true
                            enabled: !view.still
                            Accessible.ignored: true
                            onClicked: view.tabPicked(tabButton.modelData.key)
                        }
                    }
                }
            }
            Text {
                visible: !view.tabs
                x: Theme.s
                anchors.verticalCenter: parent.verticalCenter
                text: t`Agent log`
                color: Theme.text
                font.family: Theme.sans
                font.pixelSize: Theme.captionSize
                font.weight: Font.DemiBold
            }
            Rectangle {
                anchors.bottom: parent.bottom
                width: parent.width
                height: 1
                color: Theme.divider
            }
        }

        Text {
            id: stepLine
            visible: view.tab === "agent"
            y: head.height + Theme.xs
            text: t`Step ${view.at} of ${view.total}`
            color: Theme.textMuted
            font.family: Theme.sans
            font.pixelSize: Theme.captionSize
        }

        // The agent's log, kept at its newest line while the reader
        // has not scrolled back up it.
        Flickable {
            id: logView
            visible: view.tab === "agent"
            y: stepLine.y + stepLine.height + Theme.xs
            width: parent.width
            height: parent.height - y
            contentWidth: width
            contentHeight: lines.height + Theme.xs
            clip: true
            interactive: !view.still
            boundsBehavior: Flickable.StopAtBounds
            property bool following: true
            onMovementEnded: following = contentY >= contentHeight - height - 4
            function follow() {
                if (!following)
                    return;
                const end = Math.max(0, contentHeight - height);
                if (view.calm || view.still)
                    contentY = end;
                else {
                    scrollTo.to = end;
                    scrollTo.restart();
                }
            }
            onContentHeightChanged: follow()
            onHeightChanged: follow()
            NumberAnimation {
                id: scrollTo
                target: logView
                property: "contentY"
                duration: Theme.enterPanel
                easing.type: Easing.OutCubic
            }

            Column {
                id: lines
                width: logView.width
                spacing: Theme.xs

                Repeater {
                    model: logModel
                    AgentLogRow {
                        width: lines.width
                        fresh: !view.still
                        calm: view.calm
                    }
                }
            }
        }

        // The part of the TypeScript that lays the running app out, word
        // for word from the file its module was built from (DispatchSource
        // is cut from both), with the lines the edit changed marked once it
        // has been made. No line wraps: the type is sized to its longest.
        Flickable {
            id: sourceView
            visible: view.tab === "source"
            y: head.height + Theme.xs
            width: parent.width
            height: parent.height - y
            contentWidth: width
            contentHeight: sourceColumn.height
            clip: true
            boundsBehavior: Flickable.StopAtBounds

            Column {
                id: sourceColumn
                width: sourceView.width
                spacing: Theme.xs

                Text {
                    width: parent.width
                    text: t`board.ts, the code this app runs`
                    color: Theme.textMuted
                    font.family: Theme.sans
                    font.pixelSize: Theme.captionSize - 1
                    wrapMode: Text.Wrap
                }
                Rectangle {
                    width: parent.width
                    height: source.height + 2 * Theme.xs
                    radius: Theme.radiusSmall
                    color: Theme.codeBg

                    // Beside the lines the edit changed, a bar: a mark that is
                    // not told by colour alone. DECISION: no tint behind them,
                    // as any tint that shows takes the light scheme's green
                    // strings under 4.5:1 (4.79 on the code's own ground).
                    Repeater {
                        model: view.running === "board" || view.swaps > 0 ? DispatchSource[view.running].changed : []
                        Rectangle {
                            required property int modelData
                            objectName: "editedLine"
                            y: source.y + modelData * source.lineHeight
                            width: 3
                            height: source.lineHeight
                            color: Theme.link
                        }
                    }
                    Text {
                        id: source
                        objectName: "boardSource"
                        x: Theme.xxs
                        y: Theme.xs
                        width: parent.width - 2 * Theme.xxs
                        color: Theme.codeFg
                        font.family: Theme.mono
                        // board.ts keeps this to 39 columns, each 0.6 of the size, and a little.
                        font.pixelSize: Math.max(10, Math.min(14, Math.floor(width / 23.6)))
                        lineHeightMode: Text.FixedHeight
                        lineHeight: 22
                        textFormat: Text.RichText
                        wrapMode: Text.NoWrap
                        // Markup keeps no run of spaces: each line's own indent stays.
                        text: Editor.richOf(DispatchSource[view.running].rich).split("\n").map((line) => {
                            const indent = /^ */.exec(line)[0];
                            return "&nbsp;".repeat(indent.length) + line.slice(indent.length);
                        }).join("<br/>")
                    }
                }
            }
        }

        // A small Observer: the card's live tree, and what the picked
        // object holds. It is the replay's one Observer.
        Item {
            id: observerView
            visible: view.tab === "observer"
            y: head.height + Theme.s
            width: parent.width
            height: parent.height - y
            readonly property bool sideBySide: width >= 440

            Flickable {
                id: treeView
                width: observerView.sideBySide ? Math.round(parent.width * 0.5) - Theme.xs : parent.width
                height: observerView.sideBySide ? parent.height : Math.round(parent.height * 0.5) - Theme.xs
                contentHeight: treeColumn.height
                clip: true
                boundsBehavior: Flickable.StopAtBounds

                Column {
                    id: treeColumn
                    width: treeView.width
                    Repeater {
                        model: view.treeRows
                        Rectangle {
                            id: treeRow
                            required property var modelData
                            width: treeColumn.width
                            height: 24
                            radius: 4
                            color: view.pickedRef === modelData.ref ? Theme.surfaceSelected : rowHit.containsMouse ? Theme.surfaceHover : "transparent"
                            Accessible.role: Accessible.Button
                            Accessible.name: t`Inspect ${modelData.label}`
                            Text {
                                x: 4 + 12 * treeRow.modelData.depth
                                anchors.verticalCenter: parent.verticalCenter
                                width: parent.width - x - 4
                                text: treeRow.modelData.label
                                color: Theme.text
                                font.family: Theme.mono
                                font.pixelSize: Theme.captionSize - 1
                                elide: Text.ElideRight
                            }
                            MouseArea {
                                id: rowHit
                                anchors.fill: parent
                                hoverEnabled: true
                                Accessible.ignored: true
                                onClicked: view.treePicked(treeRow.modelData.ref)
                            }
                        }
                    }
                }
            }
            Flickable {
                x: observerView.sideBySide ? treeView.width + 2 * Theme.xs : 0
                y: observerView.sideBySide ? 0 : treeView.height + 2 * Theme.xs
                width: parent.width - x
                height: parent.height - y
                contentHeight: propertyColumn.height
                clip: true
                boundsBehavior: Flickable.StopAtBounds

                Column {
                    id: propertyColumn
                    width: parent.width
                    spacing: 2
                    Text {
                        visible: view.propertyRows.length === 0
                        width: parent.width
                        text: t`Pick an object to see its properties.`
                        color: Theme.textMuted
                        font.family: Theme.sans
                        font.pixelSize: Theme.captionSize
                        wrapMode: Text.Wrap
                    }
                    Repeater {
                        model: view.propertyRows
                        Text {
                            required property var modelData
                            width: propertyColumn.width
                            text: `${modelData.name}: ${modelData.value}${modelData.mine ? "  ·  " + t`set by the agent` : ""}`
                            color: modelData.mine ? Theme.link : Theme.text
                            font.family: Theme.mono
                            font.pixelSize: Theme.captionSize - 1
                            elide: Text.ElideRight
                        }
                    }
                }
            }
        }
    }
}
