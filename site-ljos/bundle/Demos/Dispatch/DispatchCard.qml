// Ljos.Core before QtQuick: only its t`` is wanted here, and any name
// both have stays QtQuick's, the later import.
import Ljos.Core
import QtQuick
import Ljos.Controls
import Ljos.Design
import "logic/tickets.ts" as Tickets

// Brekka Grid's dispatch card: the tickets a shift has, each with its
// status and the crew on it. Assigning a crew logs a line, which is
// what an agent following the app reads (`app_watch`, `app_logs`).
Card {
    id: dispatch
    objectName: "dispatch"

    // Reduced motion: the list changes by a crossfade, nothing slides.
    property bool calm: Motion.reduced
    // The ink of an open ticket's status: a role of the theme, which
    // keeps 4.5:1 on the fills it is drawn on in every scheme.
    property color statusInk: Theme.warningForeground
    readonly property bool narrow: width < 520

    signal logged(string line)

    function log(line: string) {
        console.info(line);
        dispatch.logged(line);
    }

    padding: 0

    Column {
        width: dispatch.availableWidth

        Item {
            id: headerRow
            objectName: "headerRow"
            width: parent.width
            height: Math.max(72, heading.implicitHeight + 32)

            Rectangle {
                id: mark
                x: 20
                anchors.verticalCenter: parent.verticalCenter
                width: 36
                height: 36
                radius: 18
                color: Theme.accentSurface
                Icon {
                    anchors.centerIn: parent
                    name: "zap"
                    color: Theme.link
                }
            }
            Column {
                id: heading
                anchors.left: mark.right
                anchors.leftMargin: 12
                anchors.right: tools.left
                anchors.rightMargin: 12
                anchors.verticalCenter: parent.verticalCenter
                Label {
                    width: parent.width
                    text: t`Brekka Grid`
                    color: Theme.textMuted
                    font.pixelSize: Typography.captionSize
                    wrapMode: Text.Wrap
                }
                Label {
                    width: parent.width
                    text: ticketList.openOnly
                          ? t`Dispatch · ${Tickets.count(Tickets.all, true)} open`
                          : t`Dispatch · ${Tickets.all.length} tickets`
                    font.pixelSize: Typography.subtitleSize
                    font.weight: Font.DemiBold
                    wrapMode: Text.Wrap
                    Accessible.role: Accessible.Heading
                }
            }
            Row {
                id: tools
                anchors.right: parent.right
                anchors.rightMargin: 16
                anchors.verticalCenter: parent.verticalCenter
                spacing: Theme.spacing
                Button {
                    id: openFilter
                    objectName: "openFilter"
                    text: t`Open only`
                    checkable: true
                    onToggled: ticketList.openOnly = checked
                }
            }
        }

        Rectangle {
            width: parent.width
            height: 1
            color: Theme.border
        }

        Column {
            id: ticketList
            objectName: "ticketList"
            width: parent.width

            // Set by the header's filter, when it has one.
            property bool openOnly: false
            // What the rows show: `openOnly` at once, or once the list
            // has faded out where motion is reduced.
            property bool applied: openOnly
            onOpenOnlyChanged: {
                dispatch.log(openOnly ? "filter: open only" : "filter: all tickets");
                if (dispatch.calm)
                    crossfade.restart();
                else
                    applied = openOnly;
            }
            SequentialAnimation {
                id: crossfade
                NumberAnimation { target: ticketList; property: "opacity"; to: 0; duration: Motion.exitSmall; easing.type: Easing.InCubic }
                ScriptAction { script: ticketList.applied = ticketList.openOnly }
                NumberAnimation { target: ticketList; property: "opacity"; to: 1; duration: Motion.enterSmall; easing.type: Easing.OutCubic }
            }

            // The rows that stay slide to their new place, and none of it
            // lays the card out again each frame.
            move: dispatch.calm ? null : slide
            Transition {
                id: slide
                NumberAnimation { properties: "y"; duration: Motion.movePanel; easing.type: Easing.InOutCubic }
            }

            Repeater {
                model: Tickets.all

                Item {
                    id: row
                    required property var modelData
                    required property int index
                    readonly property bool open: modelData.status === "open"

                    objectName: "ticket-" + modelData.id
                    width: ticketList.width
                    height: Math.max(64, (dispatch.narrow ? words.implicitHeight + side.implicitHeight + 8
                                                          : Math.max(words.implicitHeight, side.implicitHeight)) + 24)
                    visible: Tickets.shows(modelData, ticketList.applied)
                    // A row that comes back fades in where the others slide
                    // apart for it. Not the Column's `add`: Ljós's native
                    // positioner leaves an item it adds at the transition's
                    // `from`.
                    onVisibleChanged: if (visible && !dispatch.calm) appear.restart()
                    NumberAnimation {
                        id: appear
                        target: row
                        property: "opacity"
                        from: 0
                        to: 1
                        duration: Motion.enterPanel
                        easing.type: Easing.OutCubic
                    }

                    Column {
                        id: words
                        anchors.left: parent.left
                        anchors.leftMargin: 20
                        anchors.right: dispatch.narrow ? parent.right : side.left
                        anchors.rightMargin: dispatch.narrow ? 16 : 12
                        y: dispatch.narrow ? 12 : Math.round((row.height - height) / 2)
                        spacing: 2
                        Label {
                            width: parent.width
                            text: row.modelData.id + " · " + row.modelData.site
                            color: Theme.textMuted
                            font.pixelSize: Typography.captionSize
                            wrapMode: Text.Wrap
                        }
                        Label {
                            width: parent.width
                            text: row.modelData.title
                            font.pixelSize: Typography.bodySize
                            font.weight: Font.Medium
                            wrapMode: Text.Wrap
                        }
                    }

                    Row {
                        id: side
                        x: dispatch.narrow ? 20 : row.width - width - 16
                        y: dispatch.narrow ? words.y + words.height + 8 : Math.round((row.height - height) / 2)
                        spacing: 12

                        Rectangle {
                            id: statusPill
                            objectName: "statusPill"
                            anchors.verticalCenter: parent.verticalCenter
                            width: stateText.implicitWidth + 16
                            height: 22
                            radius: 11
                            // A fill the theme reaches its inks against, so the
                            // state keeps 4.5:1 here; the edge carries the hue.
                            color: Theme.surfaceRaised
                            border.width: 1
                            border.color: row.open ? Theme.warningForeground : Theme.border
                            Label {
                                id: stateText
                                objectName: "stateText"
                                anchors.centerIn: parent
                                text: row.open ? t`Open` : t`Closed`
                                color: row.open ? dispatch.statusInk : Theme.textMuted
                                font.pixelSize: Typography.captionSize
                                font.weight: Font.DemiBold
                            }
                        }
                        // A closed ticket's crew is history: it is read, not
                        // picked, so it is a label rather than a control
                        // switched off.
                        ComboBox {
                            objectName: "crew-" + row.modelData.id
                            visible: row.open
                            // Wider with larger text, so no name is cut.
                            width: Math.max(148, implicitWidth)
                            model: Tickets.crews
                            currentIndex: Tickets.crewIndex(row.modelData.crew)
                            Accessible.name: t`Assign crew to ${row.modelData.id}`
                            onActivated: dispatch.log(Tickets.assigned(row.modelData, currentText))
                        }
                        Label {
                            visible: !row.open
                            width: 148
                            anchors.verticalCenter: parent.verticalCenter
                            text: row.modelData.crew
                            color: Theme.textMuted
                            wrapMode: Text.Wrap
                        }
                    }

                    Rectangle {
                        anchors.bottom: parent.bottom
                        anchors.left: parent.left
                        anchors.leftMargin: 20
                        anchors.right: parent.right
                        height: 1
                        color: Theme.border
                        opacity: 0.6
                    }
                }
            }
        }
    }
}
