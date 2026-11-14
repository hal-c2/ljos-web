import QtQuick

// A page as a site writes one: a heading, text a reader came for, a link
// onward, and something to press whose count the press changes. The
// prerendered HTML must hold the words and the link before any script
// runs, and pressing must still work once the page is hydrated.
Column {
    id: page
    property int count: 0
    // What a page says as it is made is not the page: none of this may
    // land in the HTML a prerender writes.
    Component.onCompleted: console.log("a page logging <while> it is made")

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
    // Code as a site shows it, highlighted by its build: rich text whose
    // lines are breaks, coloured by class, at a line height of its own
    // (one the font's metrics give is the browser's to find).
    Text {
        font.family: "monospace"
        font.pixelSize: 12
        lineHeightMode: Text.FixedHeight
        lineHeight: 18
        textFormat: Text.RichText
        text: '<span class="tok-keyword">import</span> code<br/>a second line<br/>a third line'
    }
    // Blocks are lines of their own, wrapping or not: what comes under
    // them is placed by the height the build measured.
    Column {
        Text {
            font.pixelSize: 12
            lineHeightMode: Text.FixedHeight
            lineHeight: 18
            textFormat: Text.RichText
            text: '<div>a block</div><div>a block below it</div>'
        }
        Text { text: "Under the blocks" }
    }
    // Rows a Repeater makes, in a Column: in the page as written they
    // are placed one under another, as the page settles, not left as
    // the Column first read its children (none).
    Column {
        Repeater {
            model: ["A first row", "A second row"]
            Text { required property string modelData; text: modelData }
        }
    }
}
