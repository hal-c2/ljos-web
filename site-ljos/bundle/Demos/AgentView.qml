// Ljós's Core before QtQuick: only its t`` is wanted here, and any name
// both have stays QtQuick's, the later import.
import Ljos.Core
import QtQuick
import Site
import Demos
import "../Site/code-editor.js" as Editor

// What the agent replay looks like: a toolbar with the request, in words,
// how it stands and the same change in the reader's hands; under that the
// dispatch card, and beside it (under it, when narrow) the TypeScript that
// lays the card out, the log of the agent's calls or a small Observer. It
// only draws: the live stage (AgentStage) sends the calls and fills the
// log, and a poster fills it once, still. That it is a replay, and its
// one button, are the frame's to draw in that toolbar (DemoFrame.barOnTop):
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
    readonly property bool finished: !still && total > 0 && at >= total && card.layout === "board"
    property bool calm: false
    // A poster: nothing moves, and only the layout can be changed.
    property bool still: false
    property bool editable: !still
    // The small Observer's tree (Stage.treeRows) and the picked object's
    // properties (Stage.propertyRows).
    property var treeRows: []
    property var propertyRows: []
    property string pickedRef: ""

    readonly property alias card: card
    readonly property alias log: logModel

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
    // under it is held for the fullest it plays to and the press it then
    // asks for, so neither the page nor the code under it moves.
    readonly property int cardRoom: Math.max(card.implicitHeight, wide ? 540 : width < 420 ? 640 : 480)
    readonly property int sideRoom: 432
    implicitHeight: strip.height + pad + (wide ? Math.max(cardRoom, sideRoom) : cardRoom + gap + sideRoom)
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
                checked: card.layout === "list"
                onPressed: view.layoutPicked("list")
            }
            StageButton {
                text: t`Board`
                label: t`Board layout`
                checkable: true
                checked: card.layout === "board"
                onPressed: view.layoutPicked("board")
            }
        }
        // At the end the next step: the card's own button is the one in the
        // accent, so it and these words are what is seen to press.
        Text {
            x: view.pad
            y: view.roomy ? 48 : 76
            width: strip.width - 2 * view.pad - (view.roomy ? 176 : 0)
            text: view.edited ? t`Your edit` : view.still ? t`End result, not run` : view.finished ? (card.unassigned > 0 ? t`Done. Try Assign crew or List / Board.` : t`Done`) : view.working ? t`Working…` : ""
            color: Theme.link
            font.family: Theme.sans
            font.pixelSize: Theme.captionSize
            font.weight: Font.DemiBold
            wrapMode: Text.Wrap
        }
    }

    // The app: the one frame here.
    DispatchCard {
        id: card
        x: view.pad
        y: strip.height
        width: view.wide ? view.width - 2 * view.pad - view.gap - view.sideWidth : view.width - 2 * view.pad
        height: implicitHeight
        calm: view.calm
        still: view.still
    }

    // The log, the source or the Observer.
    Item {
        id: side
        x: view.wide ? card.x + card.width + view.gap : view.pad
        y: view.wide ? strip.height : strip.height + view.cardRoom + view.gap
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

        // The part of the TypeScript the card calls that makes the board,
        // word for word (DispatchSource is cut from the file), with the
        // file it is. No line wraps: the type is sized to its longest.
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

                    Text {
                        id: source
                        objectName: "boardSource"
                        x: Theme.xs
                        y: Theme.xs
                        width: parent.width - 2 * Theme.xs
                        color: Theme.codeFg
                        font.family: Theme.mono
                        // board.ts keeps this to 39 columns, each 0.6 of the size, and a little.
                        font.pixelSize: Math.max(10, Math.min(14, Math.floor(width / 23.6)))
                        lineHeightMode: Text.FixedHeight
                        lineHeight: 22
                        textFormat: Text.RichText
                        wrapMode: Text.NoWrap
                        // Markup keeps no run of spaces: each line's own indent stays.
                        text: Editor.richOf(DispatchSource.rich).split("\n").map((line) => {
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
