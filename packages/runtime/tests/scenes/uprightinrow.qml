// The other way in: a column that goes down, in a row that only goes
// sideways. A list in a carousel's page, say. What the row is turned by
// over the column.
import QtQuick

Item {
    width: 400
    height: 300

    property alias row: row
    property alias column: column

    Flickable {
        id: row
        width: 300
        height: 200
        contentWidth: 600
        contentHeight: 200
        flickableDirection: Flickable.HorizontalFlick

        Flickable {
            id: column
            width: 150
            height: 200
            contentWidth: 150
            contentHeight: 800
            flickableDirection: Flickable.VerticalFlick

            Rectangle {
                width: 150
                height: 800
                color: "teal"
            }
        }
    }
}
