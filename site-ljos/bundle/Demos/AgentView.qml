// Ljós's Core before QtQuick: only its t`` is wanted here, and any name
// both have stays QtQuick's, the later import.
import Ljos.Core
import QtQuick
import Site
import "logic/stage.ts" as Stage

// What the agent replay looks like: the dispatch card in its window, and
// beside it (under it, when narrow) the log of the agent's calls, the card
// as source, or a small Observer on it. It only draws: the live stage
// (AgentStage) sends the calls and fills the log, and a poster fills it
// once, still. The controls say what they want through signals.
Rectangle {
    id: view

    // Tabs for the log, the source and the Observer; without them, the log.
    property bool tabs: true
    // "agent", "source" or "observer".
    property string tab: "agent"
    property string badge: t`Replay · no live agent`
    // Steps done and how many there are.
    property int at: 0
    property int total: 0
    property bool playing: false
    property bool calm: false
    // A poster: nothing moves, nothing can be pressed.
    property bool still: false
    // The small Observer's tree (Stage.treeRows) and the picked object's
    // properties (Stage.propertyRows).
    property var treeRows: []
    property var propertyRows: []
    property string pickedRef: ""

    readonly property alias card: card
    readonly property alias log: logModel

    signal play
    signal pause
    signal next
    signal previous
    signal restart
    signal tabPicked(string tab)
    signal treePicked(string ref)

    readonly property bool wide: width >= 760
    readonly property int pad: wide ? Theme.l : Theme.s
    readonly property int gap: wide ? Theme.m : Theme.s

    color: Theme.stage

    ListModel {
        id: logModel
    }

    // The app's window.
    Rectangle {
        id: window
        x: view.pad
        y: view.pad
        width: view.wide ? Math.round((view.width - 2 * view.pad - view.gap) * 0.54) : view.width - 2 * view.pad
        height: view.wide ? view.height - 2 * view.pad : Math.round((view.height - 2 * view.pad - view.gap) * 0.48)
        radius: Theme.radius
        color: Theme.paper
        border.color: Theme.stageEdge
        border.width: 1

        Item {
            id: titleBar
            width: parent.width
            height: 34

            Text {
                x: Theme.s
                anchors.verticalCenter: parent.verticalCenter
                text: t`Dispatch`
                color: Theme.textMuted
                font.family: Theme.sans
                font.pixelSize: Theme.captionSize
            }
            // The app runs: live, not a picture (a poster says nothing).
            Row {
                visible: !view.still
                anchors.right: parent.right
                anchors.rightMargin: Theme.s
                anchors.verticalCenter: parent.verticalCenter
                spacing: 6

                Rectangle {
                    id: liveDot
                    anchors.verticalCenter: parent.verticalCenter
                    width: 7
                    height: 7
                    radius: 3.5
                    color: Theme.accent
                    SequentialAnimation on opacity {
                        running: !view.calm && !view.still && view.playing
                        loops: Animation.Infinite
                        NumberAnimation {
                            to: 0.35
                            duration: 900
                            easing.type: Easing.InOutSine
                        }
                        NumberAnimation {
                            to: 1
                            duration: 900
                            easing.type: Easing.InOutSine
                        }
                    }
                }
                Text {
                    text: t`live`
                    color: Theme.textMuted
                    font.family: Theme.sans
                    font.pixelSize: Theme.captionSize
                }
            }
            Rectangle {
                anchors.bottom: parent.bottom
                width: parent.width
                height: 1
                color: Theme.divider
            }
        }

        DispatchCard {
            id: card
            x: Theme.s
            y: titleBar.height + Theme.s
            width: parent.width - 2 * Theme.s
            height: parent.height - y - Theme.s
            calm: view.calm
            still: view.still
        }
    }

    // The log, the source or the Observer.
    Rectangle {
        id: side
        x: view.wide ? window.x + window.width + view.gap : view.pad
        y: view.wide ? view.pad : window.y + window.height + view.gap
        width: view.wide ? view.width - x - view.pad : view.width - 2 * view.pad
        height: view.height - y - view.pad
        radius: Theme.radius
        color: Theme.surface
        border.color: Theme.divider
        border.width: 1
        clip: true

        // Its tabs, or its title, and what it is: a replay.
        Item {
            id: head
            width: parent.width
            height: 44

            Row {
                id: tabRow
                visible: view.tabs
                Accessible.role: Accessible.PageTabList
                Accessible.name: t`What the replay shows`
                x: Theme.xs
                anchors.verticalCenter: parent.verticalCenter
                spacing: 2

                Repeater {
                    model: view.tabs ? [{ key: "agent", name: t`Agent` }, { key: "source", name: t`Source` }, { key: "observer", name: t`Observer` }] : []
                    Rectangle {
                        id: tabButton
                        required property var modelData
                        readonly property bool current: view.tab === modelData.key
                        width: tabWords.implicitWidth + 2 * Theme.s
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
            // Never mistaken for a model at work.
            Rectangle {
                visible: view.tab === "agent" && (!view.tabs || head.width - tabRow.width > badgeWords.implicitWidth + 3 * Theme.s)
                anchors.right: parent.right
                anchors.rightMargin: Theme.s
                anchors.verticalCenter: parent.verticalCenter
                width: badgeWords.implicitWidth + 2 * Theme.xs
                height: 22
                radius: 11
                color: "transparent"
                border.color: Theme.border
                border.width: 1
                Text {
                    id: badgeWords
                    anchors.centerIn: parent
                    text: view.badge
                    color: Theme.textMuted
                    font.family: Theme.sans
                    font.pixelSize: Theme.captionSize - 1
                }
            }
            Rectangle {
                anchors.bottom: parent.bottom
                width: parent.width
                height: 1
                color: Theme.divider
            }
        }

        // The agent's log, kept at its newest line while the reader
        // has not scrolled back up it.
        Flickable {
            id: logView
            visible: view.tab === "agent"
            x: Theme.s
            y: head.height + Theme.xs
            width: parent.width - 2 * Theme.s
            height: controls.y - y - Theme.xs
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

        // The card, as the source its state amounts to.
        Flickable {
            id: sourceView
            visible: view.tab === "source"
            x: Theme.s
            y: head.height + Theme.s
            width: parent.width - 2 * Theme.s
            height: parent.height - y - Theme.s
            contentWidth: Math.max(width, sourceText.implicitWidth)
            contentHeight: sourceText.implicitHeight + Theme.s
            clip: true
            boundsBehavior: Flickable.StopAtBounds

            Text {
                id: sourceText
                text: view.tab === "source" ? Stage.sourceOf(card.heading, card.filters, card.tickets, card.crews) : ""
                color: Theme.codeFg
                font.family: Theme.mono
                font.pixelSize: Theme.captionSize - 1
                lineHeightMode: Text.FixedHeight
                lineHeight: 18
            }
        }

        // A small Observer: the card's live tree, and what the picked
        // object holds. The whole Observer opens from the stage's toolbar.
        Item {
            id: observerView
            visible: view.tab === "observer"
            x: Theme.s
            y: head.height + Theme.s
            width: parent.width - 2 * Theme.s
            height: parent.height - y - Theme.s
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
                        text: t`Pick an object to see what it holds.`
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

        // The replay's own controls.
        Item {
            id: controls
            visible: view.tab === "agent"
            y: parent.height - height
            width: parent.width
            height: view.tab === "agent" ? 48 : 0
            readonly property bool roomy: width >= 620

            Rectangle {
                width: parent.width
                height: 1
                color: Theme.divider
            }
            Row {
                x: Theme.s
                anchors.verticalCenter: parent.verticalCenter
                spacing: Theme.xs
                enabled: !view.still

                StageButton {
                    text: view.playing ? t`Pause` : t`Play replay`
                    label: view.playing ? t`Pause` : t`Play replay`
                    primary: !view.playing && view.at < view.total
                    onPressed: view.playing ? view.pause() : view.play()
                }
                StageButton {
                    text: controls.roomy ? t`Previous step` : "←"
                    label: t`Previous step`
                    enabled: view.at > 0
                    onPressed: view.previous()
                }
                StageButton {
                    text: controls.roomy ? t`Next step` : "→"
                    label: t`Next step`
                    enabled: view.at < view.total
                    onPressed: view.next()
                }
                StageButton {
                    text: controls.roomy ? t`Restart replay` : "↺"
                    label: t`Restart replay`
                    enabled: view.at > 0
                    onPressed: view.restart()
                }
            }
            Text {
                visible: controls.width >= 360
                anchors.right: parent.right
                anchors.rightMargin: Theme.s
                anchors.verticalCenter: parent.verticalCenter
                text: t`Step ${view.at} of ${view.total}`
                color: Theme.textMuted
                font.family: Theme.sans
                font.pixelSize: Theme.captionSize
            }
        }
    }
}
