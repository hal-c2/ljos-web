import Ljos.Ui
import QtQuick as Q
import Ljos.Core
import Ljos.Layout
import Site
import "logic/dispatch.ts" as Dispatch

// A field-service dispatch card for Brekka Grid, a made-up grid operator:
// the app the landing's agent reshapes. Everything it shows is data in its
// own properties (a heading, the tickets, the filters), drawn by the
// card's own trusted parts, in the lanes a board module's typed TypeScript
// gives it (`lay`): DispatchList.qml is built from logic/before/board.ts,
// DispatchBoard.qml from logic/after/board.ts. An agent changes what the
// card shows by setting those properties over MCP, and how it is laid out
// by an edit of board.ts; it never sends a part to draw.
// What a person (or the agent) does in it is said through `told`, which
// the stage keeps as the app's log.
Rectangle {
    id: card
    objectName: "dispatch"

    // What the card shows.
    property string heading: ""
    property string org: "Brekka Grid"
    property list<Dispatch.Ticket> tickets: []
    property list<string> filters: []
    property bool openOnly: false
    // Which board module made the card: "list" or "board".
    property string layout: ""
    // That module's `lanes`. Without one, the tickets are one list.
    property Dispatch.MaybeLay lay: undefined
    // The crew each ticket was given here, by its key: a person's press
    // or an agent's, over the crew the ticket came with.
    property Dispatch.Crews crews: ({})
    // The ticket picked, by its key.
    property string picked: ""
    // Gently, for a reader who asked for less motion: rows fade in place.
    // From its first frame, as a loader makes the card before anyone can
    // tell it.
    property bool calm: Theme.calm
    // A picture of the card (a poster): what it shows stands at once.
    property bool still: false

    signal told(string line)

    readonly property list<Dispatch.Ticket> shown: openOnly ? tickets.filter((ticket: Dispatch.Ticket) => ticket.state === "Open") : tickets
    readonly property int openCount: tickets.filter((ticket: Dispatch.Ticket) => ticket.state === "Open").length
    readonly property int unassigned: tickets.filter((ticket: Dispatch.Ticket) => ticket.state === "Open" && crewOf(ticket) === "").length
    readonly property bool narrow: width < 420
    // Too narrow for the filters beside the heading.
    readonly property bool tight: width < 360
    readonly property list<Dispatch.Ticket> placed: shown.map((ticket: Dispatch.Ticket) => Object.assign({}, ticket, { crew: crewOf(ticket) }))
    readonly property list<Dispatch.Lane> lanes: Dispatch.laid(lay, placed)
    readonly property bool boarded: lanes.length > 1
    // The board with no ticket left to assign: its crewed lane has all the
    // width, as half a board of nothing reads as something missing.
    readonly property bool staffed: lanes.length === 2 && lanes[0]?.tickets.length === 0 && (lanes[1]?.tickets.length ?? 0) > 0

    // Where rows already stood: a row rises in the first time its ticket
    // stands in a layout with that crew, so a change of either is seen to
    // move, and a filter that makes its delegate again is not.
    property Dispatch.Seen seen: ({})

    function crewOf(ticket: Dispatch.Ticket): string {
        return crews[ticket.key] ?? ticket.crew ?? "";
    }
    function assign(key: string, crew: string): void {
        const next: Record<string, string> = Object.assign({}, crews);
        next[key] = crew;
        crews = next;
        told(`assigned ${key} to ${crew}`);
    }
    function toggleOpenOnly(): void {
        openOnly = !openOnly;
        told(openOnly ? `filter open only: ${openCount} of ${tickets.length} tickets` : `filter off: ${tickets.length} tickets`);
    }

    implicitWidth: 520
    // As tall as what it shows: nothing is cut, and no state is mostly blank.
    implicitHeight: body.height + 2 * body.y
    radius: Theme.radius
    fill: Theme.surfaceRaised
    border.color: Theme.divider
    border.width: 1
    clip: true

    Column {
        id: body
        // Where it starts, read from the left; a right-to-left page
        // sets it as far from the right (LayoutMirroring).
        readonly property real startX: Theme.s
        x: Q.LayoutMirroring.enabled ? parent.width - width - startX : startX
        y: Theme.s
        width: card.width - 2 * Theme.s
        spacing: Theme.s

        // The header: who it is for, what it is, and the filters offered.
        Item {
            width: parent.width
            height: Math.max(titles.height, filterRow.height)

            Column {
                id: titles
                // Anchored, so a right-to-left card has them on the right
                // and the filters, anchored the other way, on the left.
                anchors.left: parent.left
                width: parent.width - (card.tight ? 0 : filterRow.width + Theme.s)
                spacing: 2

                Text {
                    text: card.org
                    color: Theme.link
                    font.family: Theme.sans
                    font.size: Theme.captionSize
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
                    font.size: card.narrow ? Theme.subtitleSize : Theme.titleSize
                    font.weight: Font.DemiBold
                    wrap: Text.Wrap
                    opacity: card.still ? 1 : 0
                    Component.onCompleted: {
                        if (!card.still)
                            opacity = bind(() => headingText.text !== "" ? 1 : 0);
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
                    text: card.unassigned > 0 ? t`${plural(card.openCount, { one: "# open", other: "# open" })}, ${plural(card.unassigned, { one: "# unassigned", other: "# unassigned" })}` : t`${plural(card.openCount, { one: "# open", other: "# open" })}, all assigned`
                    color: Theme.textMuted
                    font.family: Theme.sans
                    font.size: Theme.captionSize
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
            fill: Theme.divider
        }

        // The tickets, a list a screen reader counts, in the lanes board.ts
        // puts them in: one for the list, two for the board, one over the
        // other on a narrow card.
        Grid {
            id: board
            width: parent.width
            columns: card.narrow ? 1 : Math.max(1, card.lanes.length)
            columnSpacing: Theme.xs
            rowSpacing: Theme.s

            Repeater {
                model: card.lanes

                Column {
                    id: lane
                    required property Dispatch.Lane modelData
                    required property int index
                    // Hidden, not unmade: the page as written and as hydrated
                    // make the same parts.
                    visible: !card.staffed || index === 1
                    width: card.staffed || board.columns === 1 ? board.width : Math.floor((board.width - (card.lanes.length - 1) * board.columnSpacing) / card.lanes.length)
                    spacing: Theme.xs

                    Text {
                        visible: lane.modelData.title !== ""
                        width: parent.width
                        text: lane.modelData.title
                        color: Theme.text
                        font.family: Theme.sans
                        font.size: Theme.captionSize
                        font.weight: Font.DemiBold
                        wrap: Text.Wrap
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
                                required property Dispatch.Ticket modelData
                                readonly property string crew: modelData.crew
                                readonly property bool open: modelData.state === "Open"
                                readonly property bool boarded: card.boarded

                                width: lane.width
                                height: (boarded ? lines.height + 2 + crewSide.height : Math.max(lines.height, crewSide.height)) + 2 * Theme.xs
                                radius: Theme.radiusSmall
                                fill: card.picked === modelData.key ? Theme.surfaceSelected : pick.containsMouse ? Theme.surfaceHover : boarded ? Theme.surface : "transparent"
                                border.width: boarded ? 1 : 0
                                border.color: Theme.divider
                                Accessible.role: Accessible.ListItem
                                Accessible.name: `${modelData.key} ${modelData.title}, ${modelData.state}, ${crew === "" ? t`no crew` : crew}`

                                opacity: 1
                                transform: Translate {
                                    id: lift
                                }
                                Component.onCompleted: {
                                    const place = `${card.boarded} ${modelData.key} ${crew}`;
                                    if (card.still || card.seen[place] === true)
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
                                Behavior on fill {
                                    ColorAnimation {
                                        duration: Theme.moveSmall
                                    }
                                }

                                PointerArea {
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
                                    // Where it starts, read from the left; a right-to-left page
                                    // sets it as far from the right (LayoutMirroring).
                                    readonly property real startX: Theme.xs
                                    x: Q.LayoutMirroring.enabled ? parent.width - width - startX : startX
                                    y: Theme.xs + 5
                                    width: 8
                                    height: 8
                                    radius: 4
                                    fill: row.open ? Theme.accent : "transparent"
                                    border.color: row.open ? Theme.accent : Theme.border
                                    border.width: 1
                                }
                                Column {
                                    id: lines
                                    // Where it starts, read from the left; a right-to-left page
                                    // sets it as far from the right (LayoutMirroring).
                                    readonly property real startX: dot.startX + dot.width + Theme.xs
                                    x: Q.LayoutMirroring.enabled ? parent.width - width - startX : startX
                                    y: Theme.xs
                                    width: row.width - startX - Theme.xs - (row.boarded ? 0 : crewSide.width + Theme.xs)
                                    spacing: 0

                                    Text {
                                        width: parent.width
                                        text: row.modelData.title
                                        color: Theme.text
                                        font.family: Theme.sans
                                        font.size: Theme.bodySize - 2
                                        wrap: Text.Wrap
                                    }
                                    Text {
                                        text: `${row.modelData.key}  ${row.open ? t`Open` : t`Closed`}`
                                        color: Theme.textMuted
                                        font.family: Theme.mono
                                        font.size: Theme.captionSize - 1
                                    }
                                }
                                Item {
                                    id: crewSide
                                    // Under the ticket on the board, at its end in the list.
                                    // Where it starts, read from the left; a right-to-left page
                                    // sets it as far from the right (LayoutMirroring).
                                    readonly property real startX: row.boarded ? lines.startX : row.width - width - Theme.xs
                                    x: Q.LayoutMirroring.enabled ? parent.width - width - startX : startX
                                    y: row.boarded ? lines.y + lines.height + 2 : Theme.xs
                                    width: row.open && row.crew === "" ? assignButton.width : crewName.implicitWidth
                                    height: row.open && row.crew === "" ? assignButton.height : crewName.implicitHeight

                                    Text {
                                        id: crewName
                                        visible: !(row.open && row.crew === "")
                                        text: row.crew === "" ? t`No crew` : row.crew
                                        color: row.open ? Theme.text : Theme.textMuted
                                        font.family: Theme.sans
                                        font.size: Theme.captionSize
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
