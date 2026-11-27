import QtQuick

// A field the code editor comes in over (`codeblock/attach`), and the
// Text whose look it takes: its words' colour follows `dark`, as a
// page's code follows the scheme a reader picks.
Item {
    id: root
    width: 320
    height: 120
    property bool dark: false

    Item {
        id: field
        objectName: "field"
        width: 300
        height: 80
        property string text: "Text {\n    text: \"ink\"\n}\n"

        Text {
            id: shown
            color: root.dark ? "#eef0f7" : "#1b1f2a"
            font.family: "monospace"
            font.pixelSize: root.dark ? 15 : 14
            text: field.text
        }
    }

    function fieldItem() { return field }
    function shownText() { return shown }
}
