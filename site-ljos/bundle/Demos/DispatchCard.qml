// Ljós's Core before QtQuick: only its t`` is wanted here, and any name
// both have stays QtQuick's, the later import.
import Ljos.Core
import QtQuick
import Site
import "logic/board.ts" as Board

// A field-service dispatch card for Brekka Grid, a made-up grid operator:
// the app the landing's agent reshapes. Everything it shows is data in its
// own properties (a heading, the tickets, the filters, its layout), drawn
// by the card's own trusted parts through typed TypeScript (logic/board.ts).
// An agent changes what the card shows by setting those properties over
// MCP; it never sends a part to draw.
// What a person (or the agent) does in it is said through `told`, which
// the stage keeps as the app's log.
Rectangle {
    id: card
    objectName: "dispatch"

    // What the card shows.
    property string heading: ""
    property string org: "Brekka Grid"
    property var tickets: []
    property var filters: []
    property bool openOnly: false
    // "list" or "board" (board.ts's Layout).
    property var layout: "list"
    // The crew each ticket was given here, by its key: a person's press
    // or an agent's, over the crew the ticket came with.
    property var crews: ({})
    // The ticket picked, by its key.
    property string picked: ""
    // Gently, for a reader who asked for less motion: rows fade in place.
    property bool calm: false
    // A picture of the card (a poster): what it shows stands at once.
    property bool still: false

    signal told(string line)

    readonly property var shown: openOnly ? tickets.filter((ticket) => ticket.state === "Open") : tickets
    readonly property int openCount: tickets.filter((ticket) => ticket.state === "Open").length
    readonly property int unassigned: tickets.filter((ticket) => ticket.state === "Open" && crewOf(ticket) === "").length
    readonly property bool narrow: width < 420
    // Too narrow for the filters beside the heading.
    readonly property bool tight: width < 360
    readonly property bool boarded: layout !== "list"
    readonly property var lanes: Board.lanes(layout, shown.map((ticket) => Object.assign({}, ticket, { crew: crewOf(ticket) })))

    // Where rows already stood: a row rises in the first time its ticket
    // stands in a layout with that crew, so a change of either is seen to
    // move, and a filter that makes its delegate again is not.
    property var seen: ({})

    function crewOf(ticket) {
        return crews[ticket.key] !== undefined ? crews[ticket.key] : (ticket.crew || "");
    }
    function assign(key, crew) {
        const next = Object.assign({}, crews);
        next[key] = crew;
        crews = next;
        told(`assigned ${key} to ${crew}`);
    }
    function toggleOpenOnly() {
        openOnly = !openOnly;
        told(openOnly ? `filter open only: ${openCount} of ${tickets.length} tickets` : `filter off: ${tickets.length} tickets`);
    }

    implicitWidth: 520
    // As tall as what it shows: nothing is cut, and no state is mostly blank.
    implicitHeight: body.height + 2 * body.y
    radius: Theme.radius
    color: Theme.surfaceRaised
    border.color: Theme.divider
    border.width: 1
    clip: true

    Column {
        id: body
        x: Theme.s
        y: Theme.s
        width: card.width - 2 * Theme.s
        spacing: Theme.s

        // The header: who it is for, what it is, and the filters offered.
        Item {
            width: parent.width
            height: Math.max(titles.height, filterRow.height)

            Column {
                id: titles
                width: parent.width - (card.tight ? 0 : filterRow.width + Theme.s)
                spacing: 2

                Text {
                    text: card.org
                    color: Theme.link
                    font.family: Theme.sans
                    font.pixelSize: Theme.captionSize
                    font.weight: Font.DemiBold
                }
                Text {
                    id: headingText
                    objectName: "heading"
                    width: parent.width
                    text: card.heading
                    visible: text !== ""
                    color: Theme.text
                    font.family: Theme.serif
                    font.pixelSize: card.narrow ? Theme.subtitleSize : Theme.titleSize
                    font.weight: Font.DemiBold
                    wrapMode: Text.Wrap
                    opacity: card.still ? 1 : 0
                    Component.onCompleted: {
                        if (!card.still)
                            opacity = Qt.binding(() => headingText.text !== "" ? 1 : 0);
                    }
                    Behavior on opacity {
                        NumberAnimation {
                            duration: Theme.enterPanel
                            easing.type: Easing.OutCubic
                        }
                    }
                }
                Text {
                    visible: card.tickets.length > 0
                    text: card.unassigned > 0 ? t`${card.openCount} open, ${card.unassigned} unassigned` : t`${card.openCount} open, all assigned`
                    color: Theme.textMuted
                    font.family: Theme.sans
                    font.pixelSize: Theme.captionSize
                }
            }
            Row {
                id: filterRow
                anchors.right: parent.right
                visible: !card.tight
                spacing: Theme.xs

                // Both rows keep their buttons, and only one shows: what is
                // made never waits on the card's width, so the page as written
                // and the page as hydrated make the same parts in one order.
                Repeater {
                    model: card.filters
                    StageButton {
                        required property string modelData
                        text: modelData
                        checkable: true
                        checked: card.openOnly
                        onPressed: card.toggleOpenOnly()
                    }
                }
            }
        }
        // On a tight card the filters go under the header.
        Row {
            visible: card.tight && card.filters.length > 0
            spacing: Theme.xs

            Repeater {
                model: card.filters
                StageButton {
                    required property string modelData
                    text: modelData
                    checkable: true
                    checked: card.openOnly
                    onPressed: card.toggleOpenOnly()
                }
            }
        }

        Rectangle {
            visible: card.tickets.length > 0
            width: parent.width
            height: 1
            color: Theme.divider
        }

        // The tickets, a list a screen reader counts, in the lanes board.ts
        // puts them in: one for the list, two for the board.
        Row {
            id: board
            width: parent.width
            spacing: Theme.xs

            Repeater {
                model: card.lanes

                Column {
                    id: lane
                    required property var modelData
                    width: Math.floor((board.width - (card.lanes.length - 1) * board.spacing) / card.lanes.length)
                    spacing: Theme.xs

                    Text {
                        visible: lane.modelData.title !== ""
                        width: parent.width
                        text: lane.modelData.title
                        color: Theme.text
                        font.family: Theme.sans
                        font.pixelSize: Theme.captionSize
                        font.weight: Font.DemiBold
                        wrapMode: Text.Wrap
                    }
                    Column {
                        width: parent.width
                        spacing: lane.spacing
                        Accessible.role: Accessible.List
                        Accessible.name: lane.modelData.title === "" ? t`Tickets` : lane.modelData.title

                        Repeater {
                            model: lane.modelData.tickets

                            Rectangle {
                                id: row
                                required property var modelData
                                readonly property string crew: modelData.crew
                                readonly property bool open: modelData.state === "Open"
                                readonly property bool boarded: card.boarded

                                width: lane.width
                                height: (boarded ? lines.height + 2 + crewSide.height : Math.max(lines.height, crewSide.height)) + 2 * Theme.xs
                                radius: Theme.radiusSmall
                                color: card.picked === modelData.key ? Theme.surfaceSelected : pick.containsMouse ? Theme.surfaceHover : boarded ? Theme.surface : "transparent"
                                border.width: boarded ? 1 : 0
                                border.color: Theme.divider
                                Accessible.role: Accessible.ListItem
                                Accessible.name: `${modelData.key} ${modelData.title}, ${modelData.state}, ${crew === "" ? t`no crew` : crew}`

                                opacity: 1
                                transform: Translate {
                                    id: lift
                                }
                                Component.onCompleted: {
                                    const place = `${card.layout} ${modelData.key} ${crew}`;
                                    if (card.still || card.seen[place])
                                        return;
                                    card.seen[place] = true;
                                    row.opacity = 0;
                                    lift.y = card.calm ? 0 : 10;
                                    rise.start();
                                }
                                ParallelAnimation {
                                    id: rise
                                    NumberAnimation {
                                        target: row
                                        property: "opacity"
                                        to: 1
                                        duration: Theme.enterPanel
                                        easing.type: Easing.OutCubic
                                    }
                                    NumberAnimation {
                                        target: lift
                                        property: "y"
                                        to: 0
                                        duration: Theme.enterPanel + 100
                                        easing.type: Easing.OutCubic
                                    }
                                }
                                Behavior on color {
                                    ColorAnimation {
                                        duration: Theme.moveSmall
                                    }
                                }

                                MouseArea {
                                    id: pick
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    Accessible.ignored: true
                                    onClicked: {
                                        card.picked = row.modelData.key;
                                        card.told(`picked ${row.modelData.key}`);
                                    }
                                }

                                // Its state as a dot and a word, never the colour alone.
                                Rectangle {
                                    id: dot
                                    x: Theme.xs
                                    y: Theme.xs + 5
                                    width: 8
                                    height: 8
                                    radius: 4
                                    color: row.open ? Theme.accent : "transparent"
                                    border.color: row.open ? Theme.accent : Theme.border
                                    border.width: 1
                                }
                                Column {
                                    id: lines
                                    x: dot.x + dot.width + Theme.xs
                                    y: Theme.xs
                                    width: row.width - x - Theme.xs - (row.boarded ? 0 : crewSide.width + Theme.xs)
                                    spacing: 0

                                    Text {
                                        width: parent.width
                                        text: row.modelData.title
                                        color: Theme.text
                                        font.family: Theme.sans
                                        font.pixelSize: Theme.bodySize - 2
                                        wrapMode: Text.Wrap
                                    }
                                    Text {
                                        text: `${row.modelData.key}  ${row.open ? t`Open` : t`Closed`}`
                                        color: Theme.textMuted
                                        font.family: Theme.mono
                                        font.pixelSize: Theme.captionSize - 1
                                    }
                                }
                                Item {
                                    id: crewSide
                                    // Under the ticket on the board, at its end in the list.
                                    x: row.boarded ? lines.x : row.width - width - Theme.xs
                                    y: row.boarded ? lines.y + lines.height + 2 : Theme.xs
                                    width: row.open && row.crew === "" ? assignButton.width : crewName.implicitWidth
                                    height: row.open && row.crew === "" ? assignButton.height : crewName.implicitHeight

                                    Text {
                                        id: crewName
                                        visible: !(row.open && row.crew === "")
                                        text: row.crew === "" ? t`No crew` : row.crew
                                        color: row.open ? Theme.text : Theme.textMuted
                                        font.family: Theme.sans
                                        font.pixelSize: Theme.captionSize
                                    }
                                    StageButton {
                                        id: assignButton
                                        visible: row.open && row.crew === ""
                                        primary: true
                                        text: t`Assign crew`
                                        label: t`Assign crew to ${row.modelData.key}`
                                        onPressed: card.assign(row.modelData.key, t`On-call crew`)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
