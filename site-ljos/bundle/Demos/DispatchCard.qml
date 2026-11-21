// Ljós's Core before QtQuick: only its t`` is wanted here, and any name
// both have stays QtQuick's, the later import.
import Ljos.Core
import QtQuick
import Site

// A field-service dispatch card for Brekka Grid, a made-up grid operator:
// the app the landing's agent builds. Everything it shows is data in its
// own properties (a heading, the tickets, the filters it offers), drawn
// by the card's own trusted parts. An agent changes what the card shows
// by setting those properties over MCP; it never sends a part to draw.
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
    readonly property bool empty: heading === "" && tickets.length === 0
    readonly property bool narrow: width < 420

    // Keys of the rows already shown once: a row is new, and rises in,
    // only the first time its ticket is shown, not each time a filter
    // makes its delegate again.
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
    implicitHeight: 360
    radius: Theme.radius
    color: Theme.surfaceRaised
    border.color: Theme.divider
    border.width: 1
    clip: true

    // Before the agent gives it anything: where the card will be.
    Column {
        visible: card.empty
        anchors.centerIn: parent
        width: Math.min(parent.width - 2 * Theme.l, 320)
        spacing: Theme.s

        Repeater {
            model: [0.7, 1, 0.85, 0.55]
            Rectangle {
                required property real modelData
                width: Math.round(parent.width * modelData)
                height: 10
                radius: 5
                color: Theme.surfaceHover
            }
        }
        Text {
            width: parent.width
            topPadding: Theme.xs
            horizontalAlignment: Text.AlignHCenter
            text: t`An empty window, waiting for the agent`
            color: Theme.textMuted
            font.family: Theme.sans
            font.pixelSize: Theme.captionSize
            wrapMode: Text.Wrap
        }
    }

    Column {
        id: body
        visible: !card.empty
        x: Theme.m
        y: Theme.m
        width: card.width - 2 * Theme.m
        spacing: Theme.s

        // The header: who it is for, what it is, and the filters offered.
        Item {
            width: parent.width
            height: Math.max(titles.height, filterRow.height)

            Column {
                id: titles
                width: parent.width - (card.narrow ? 0 : filterRow.width + Theme.s)
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
                    font.pixelSize: Theme.titleSize
                    font.weight: Font.DemiBold
                    elide: Text.ElideRight
                    readonly property int headingLevel: 3
                    Accessible.role: Accessible.Heading
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
                    text: card.unassigned > 0 ? t`${card.openCount} open, ${card.unassigned} without a crew` : t`${card.openCount} open, every one crewed`
                    color: Theme.textMuted
                    font.family: Theme.sans
                    font.pixelSize: Theme.captionSize
                }
            }
            Row {
                id: filterRow
                anchors.right: parent.right
                visible: !card.narrow
                spacing: Theme.xs

                Repeater {
                    model: card.narrow ? [] : card.filters
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
        // On a narrow card the filters go under the header.
        Row {
            visible: card.narrow && card.filters.length > 0
            spacing: Theme.xs

            Repeater {
                model: card.narrow ? card.filters : []
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

        Repeater {
            model: card.shown

            Rectangle {
                id: row
                required property var modelData
                required property int index
                readonly property string crew: card.crewOf(modelData)
                readonly property bool open: modelData.state === "Open"

                width: body.width
                height: Math.max(lines.height, crewSide.height) + 2 * Theme.xs
                radius: Theme.radiusSmall
                color: card.picked === modelData.key ? Theme.surfaceSelected : pick.containsMouse ? Theme.surfaceHover : "transparent"
                Accessible.role: Accessible.ListItem
                Accessible.name: `${modelData.key} ${modelData.title}, ${modelData.state}, ${crew === "" ? t`no crew` : crew}`

                // A row rises in once, the first time its ticket shows.
                opacity: 1
                transform: Translate {
                    id: lift
                }
                Component.onCompleted: {
                    if (card.still || card.seen[modelData.key])
                        return;
                    const next = Object.assign({}, card.seen);
                    next[modelData.key] = true;
                    card.seen = next;
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
                    y: Theme.xs + 7
                    width: 8
                    height: 8
                    radius: 4
                    color: row.open ? Theme.accent : "transparent"
                    border.color: row.open ? Theme.accent : Theme.border
                    border.width: 1
                }
                Column {
                    id: lines
                    x: dot.x + dot.width + Theme.s
                    y: Theme.xs
                    width: row.width - x - crewSide.width - Theme.s
                    spacing: 0

                    Text {
                        width: parent.width
                        text: row.modelData.title
                        color: Theme.text
                        font.family: Theme.sans
                        font.pixelSize: Theme.bodySize - 2
                        elide: Text.ElideRight
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
                    anchors.right: parent.right
                    anchors.rightMargin: Theme.xs
                    y: Theme.xs
                    width: row.open && row.crew === "" ? assignButton.width : crewName.implicitWidth
                    height: row.open && row.crew === "" ? assignButton.height : crewName.implicitHeight

                    Text {
                        id: crewName
                        visible: !(row.open && row.crew === "")
                        anchors.right: parent.right
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
