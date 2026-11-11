import QtQuick

// A page as a site writes one: a heading, text a reader came for, a link
// onward, and something to press whose count the press changes. The
// prerendered HTML must hold the words and the link before any script
// runs, and pressing must still work once the page is hydrated.
Column {
    id: page
    property int count: 0

    Text { text: "Prerendered heading"; font.pixelSize: 24; font.bold: true }
    Text { text: "Static text a crawler reads." }
    Text { text: '<a href="https://example.com/docs">Read the docs</a>' }
    Text { text: "Count " + page.count }
    Rectangle {
        width: 140
        height: 44
        color: "steelblue"
        Text { anchors.centerIn: parent; text: "Increment" }
        MouseArea { anchors.fill: parent; onClicked: page.count++ }
    }
}
