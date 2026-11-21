// A row that only goes sideways, in a column that goes down: a strip of
// code in a page, say. What the column is scrolled by over the row.
import QtQuick

Item {
    width: 400
    height: 300

    property alias column: column
    property alias row: row

    Flickable {
        id: column
        width: 300
        height: 200
        contentWidth: 300
        contentHeight: 800
        flickableDirection: Flickable.VerticalFlick

        Flickable {
            id: row
            y: 50
            width: 300
            height: 100
            contentWidth: 500
            contentHeight: 100
            flickableDirection: Flickable.HorizontalFlick

            Rectangle {
                width: 500
                height: 100
                color: "teal"
            }
        }
    }
}
