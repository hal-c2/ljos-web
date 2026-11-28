import Ljos.Ui
import Ljos.Core
import Ljos.Layout
import Site
import "logic/review.ts" as Review

// The review's numbers as a table, for a reader who would rather read
// them than see bars, and for every number's spread and runs: a row per
// picked framework, in the order they were picked, a column per metric,
// the timed ones as the shown renderer set measured them; then a row
// per picked web framework as Firefox measured it.
// Wider than a phone, it scrolls sideways on its own, the page does not.
Flickable {
    id: view

    required property Review.Review review
    required property list<string> picked
    // The renderer set shown, by its id.
    property string set: ""
    // The numbers the page's first load left out, once in.
    property Review.Later more: Review.notYet()

    readonly property real first: 112
    readonly property real column: 136

    height: table.height
    contentWidth: table.width
    contentHeight: table.height
    flickableDirection: Flickable.HorizontalFlick
    boundsBehavior: Flickable.StopAtBounds
    clip: true

    Column {
        id: table
        width: view.first + view.column * view.review.metrics.length
        Accessible.role: Accessible.Table
        Accessible.name: t`The numbers of the picked frameworks`

        Row {
            Accessible.role: Accessible.Row
            Text {
                width: view.first
                topPadding: Theme.xs
                bottomPadding: Theme.xs
                text: t`Framework`
                color: Theme.textMuted
                font.family: Theme.sans
                font.size: Theme.captionSize
                font.weight: Font.DemiBold
                Accessible.role: Accessible.ColumnHeader
                Accessible.name: text
            }
            Repeater {
                model: view.review.metrics
                Text {
                    required property Review.Metric modelData
                    width: view.column
                    rightPadding: Theme.s
                    topPadding: Theme.xs
                    bottomPadding: Theme.xs
                    text: `${modelData.label}, ${modelData.unit}`
                    color: Theme.textMuted
                    font.family: Theme.sans
                    font.size: Theme.captionSize
                    font.weight: Font.DemiBold
                    wrap: Text.Wrap
                    Accessible.role: Accessible.ColumnHeader
                    Accessible.name: text
                }
            }
        }
        Repeater {
            model: Review.linesOf(view.review, view.picked, view.more)
            Rectangle {
                id: line
                required property Review.Line modelData
                required property int index
                readonly property string name: line.modelData.name
                width: table.width
                height: cells.height
                fill: line.index % 2 === 0 ? Theme.surface : "transparent"
                Accessible.role: Accessible.Row
                Accessible.name: Review.lineName(view.review, line.modelData, view.set, view.more)

                Row {
                    id: cells
                    Text {
                        width: view.first
                        leftPadding: Theme.xs
                        topPadding: Theme.xs
                        bottomPadding: Theme.xs
                        text: line.name
                        color: Theme.text
                        font.family: Theme.sans
                        font.size: Theme.captionSize + 1
                        font.weight: Font.DemiBold
                        Accessible.role: Accessible.RowHeader
                        Accessible.name: text
                    }
                    Repeater {
                        model: view.review.metrics
                        Text {
                            required property Review.Metric modelData
                            width: view.column
                            rightPadding: Theme.s
                            topPadding: Theme.xs
                            bottomPadding: Theme.xs
                            text: Review.lineCell(modelData, line.modelData, view.set, view.more)
                            color: Theme.text
                            font.family: Theme.sans
                            font.size: Theme.captionSize
                            font.features: { "tnum": 1 }
                            wrap: Text.Wrap
                            Accessible.role: Accessible.Cell
                            Accessible.name: text
                        }
                    }
                }
            }
        }
    }
}
