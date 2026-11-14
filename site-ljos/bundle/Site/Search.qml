import QtQuick
import Site
import "../nav.js" as Nav

// The docs' search: page titles and the headings on them, found as the
// reader types. Up and Down choose, Return goes, Escape clears; each
// result is also a real link a pointer can follow.
Item {
    id: search

    // Where a chosen result goes: the shell lands on a heading of the
    // page being read without leaving it.
    signal picked(string href)

    readonly property var results: Nav.search(Content.pages, field.text, 8)
    readonly property bool showing: field.text.trim() !== "" && open
    property int chosen: 0
    property bool open: false

    implicitWidth: 280
    implicitHeight: 40

    function go(index) {
        if (index < 0 || index >= results.length)
            return;
        var href = results[index].href;
        open = false;
        field.text = "";
        search.picked(href);
    }

    Rectangle {
        id: box
        anchors.fill: parent
        radius: Theme.radiusSmall
        color: Theme.surfaceRaised
        border.color: field.activeFocus ? Theme.focusRing : Theme.border
        border.width: field.activeFocus ? 2 : 1

        // A magnifying glass.
        Item {
            x: 12
            anchors.verticalCenter: parent.verticalCenter
            width: 16
            height: 16
            Accessible.ignored: true

            Rectangle {
                width: 12
                height: 12
                radius: 6
                color: "transparent"
                border.color: Theme.textMuted
                border.width: 2
            }
            Rectangle {
                x: 9
                y: 11
                width: 7
                height: 2
                radius: 1
                color: Theme.textMuted
                rotation: 45
            }
        }
        Text {
            x: field.x
            anchors.verticalCenter: parent.verticalCenter
            visible: field.text === ""
            text: "Search the docs…"
            color: Theme.textMuted
            font.family: Theme.sans
            font.pixelSize: Theme.bodySize
            Accessible.ignored: true
        }
        TextInput {
            id: field
            x: 36
            width: parent.width - x - Theme.s
            anchors.verticalCenter: parent.verticalCenter
            color: Theme.text
            selectionColor: Theme.surfaceSelected
            selectedTextColor: Theme.text
            font.family: Theme.sans
            font.pixelSize: Theme.bodySize
            clip: true
            Accessible.role: Accessible.EditableText
            Accessible.name: "Search the docs"
            onTextChanged: {
                search.chosen = 0;
                search.open = true;
            }
            Keys.onPressed: (event) => {
                if (event.key === Qt.Key_Down) {
                    search.open = true;
                    search.chosen = Math.min(search.chosen + 1, search.results.length - 1);
                    event.accepted = true;
                } else if (event.key === Qt.Key_Up) {
                    search.chosen = Math.max(search.chosen - 1, 0);
                    event.accepted = true;
                } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                    search.go(search.chosen);
                    event.accepted = true;
                } else if (event.key === Qt.Key_Escape) {
                    field.text = "";
                    search.open = false;
                    event.accepted = true;
                }
            }
        }
    }

    // What was found, under the field and over the page.
    Rectangle {
        id: list
        z: 10
        visible: search.showing
        y: search.height + Theme.xxs
        width: Math.max(search.width, 320)
        height: found.implicitHeight + 2 * Theme.xs
        radius: Theme.radius
        color: Theme.surfaceRaised
        border.color: Theme.border
        border.width: 1
        // A list of none is no list: what stands then is the line
        // that says nothing was found.
        Accessible.role: search.results.length > 0 ? Accessible.List : Accessible.NoRole
        Accessible.name: "Search results"

        Column {
            id: found
            x: Theme.xs
            y: Theme.xs
            width: parent.width - 2 * Theme.xs

            Text {
                width: parent.width
                visible: search.results.length === 0
                leftPadding: Theme.s
                topPadding: Theme.xs
                bottomPadding: Theme.xs
                text: "Nothing in the docs matches “" + field.text.trim() + "”."
                color: Theme.textMuted
                font.family: Theme.sans
                font.pixelSize: Theme.bodySize
                wrapMode: Text.Wrap
            }
            Repeater {
                model: search.results

                Rectangle {
                    required property var modelData
                    required property int index

                    width: found.width
                    height: words.implicitHeight + 2 * Theme.xs
                    radius: Theme.radiusSmall
                    color: index === search.chosen ? Theme.surfaceSelected : row.containsMouse ? Theme.surfaceHover : "transparent"
                    Accessible.role: Accessible.ListItem
                    Accessible.name: modelData.where ? modelData.title + ", in " + modelData.where : modelData.title
                    Accessible.selected: index === search.chosen

                    Column {
                        id: words
                        x: Theme.s
                        y: Theme.xs
                        width: parent.width - 2 * Theme.s

                        Text {
                            width: parent.width
                            textFormat: Text.RichText
                            text: Nav.anchor(modelData.href, modelData.title, false)
                            color: Theme.text
                            linkColor: Theme.text
                            font.family: Theme.sans
                            font.pixelSize: Theme.bodySize
                            font.weight: Font.DemiBold
                            lineHeightMode: Text.FixedHeight
                            lineHeight: Theme.bodyLine
                            elide: Text.ElideRight
                            onLinkActivated: (to) => search.go(index)
                        }
                        Text {
                            width: parent.width
                            visible: modelData.where !== ""
                            text: modelData.where
                            color: Theme.textMuted
                            font.family: Theme.sans
                            font.pixelSize: Theme.captionSize
                            lineHeightMode: Text.FixedHeight
                            lineHeight: Theme.captionLine
                            elide: Text.ElideRight
                        }
                    }
                    MouseArea {
                        id: row
                        anchors.fill: parent
                        hoverEnabled: true
                        Accessible.ignored: true
                        cursorShape: Qt.PointingHandCursor
                        onEntered: search.chosen = index
                        onClicked: search.go(index)
                    }
                }
            }
        }
    }
}
