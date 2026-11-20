import QtQuick
import Site
import Ljos.Core
import "../nav.js" as Nav

// The docs' search: page titles and the headings on them, found as the
// reader types. Up and Down choose, Return goes, Escape clears; each
// result is also a real link a pointer can follow.
Item {
    id: search

    // Where a chosen result goes: the shell lands on a heading of the
    // page being read without leaving it.
    signal picked(string href)

    // What it searches, once fetched (Nav.searchIndex), and what is said
    // where it could not be.
    property var pages: null
    property string trouble: ""
    readonly property var results: pages ? Nav.search(pages, field.text, 8) : []
    readonly property bool showing: field.text.trim() !== "" && open && (pages !== null || trouble !== "")
    property int chosen: 0
    property bool open: false

    implicitWidth: 280
    implicitHeight: 40

    function load() {
        if (pages !== null || !Nav.inBrowser())
            return;
        Nav.searchIndex(Content.base).then(function (all) {
            search.trouble = "";
            search.pages = all;
        }, function () {
            search.trouble = "The search could not be loaded. Try again in a moment.";
        });
    }

    // Asked for by name (the `/` key, a desktop's File menu): the field
    // takes the keys, and the index comes as it does on a first focus.
    function find() {
        field.forceActiveFocus();
    }

    function go(index) {
        if (index < 0 || index >= results.length)
            return;
        var href = results[index].href;
        open = false;
        field.text = "";
        search.picked(Nav.at(Content.base, href));
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
            text: t`Search docs and demos`
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
            Accessible.name: t`Search`
            Accessible.description: t`Press / to search`
            onActiveFocusChanged: if (activeFocus) search.load()
            onTextChanged: {
                search.chosen = 0;
                search.open = true;
                search.load();
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
        Accessible.name: t`Search results`

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
                text: search.pages === null ? search.trouble : t`Nothing matches “${query}”. Try a type name, like ListView.`
                readonly property string query: field.text.trim()
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
                    color: index === search.chosen ? Theme.surfaceSelected : over.hovered ? Theme.surfaceHover : "transparent"
                    Accessible.role: Accessible.ListItem
                    Accessible.name: modelData.where ? modelData.title + ", in " + modelData.where : modelData.title
                    Accessible.selected: index === search.chosen

                    // Over the words too: hover is the row's, whatever in it
                    // the mouse is over.
                    HoverHandler {
                        id: over
                        cursorShape: Qt.PointingHandCursor
                        onHoveredChanged: if (hovered) search.chosen = index
                    }
                    // Under the words, not over them: the result's link is
                    // then the topmost thing in the page where it stands,
                    // so a modified click on it is the browser's (a new
                    // tab, a new window), and the rest of the row goes
                    // there in this one.
                    MouseArea {
                        anchors.fill: parent
                        Accessible.ignored: true
                        // Off the link, a modified press is not for this tab.
                        onPressed: (mouse) => mouse.accepted = (mouse.modifiers & (Qt.ControlModifier | Qt.MetaModifier | Qt.ShiftModifier)) === 0
                        onClicked: search.go(index)
                    }

                    Column {
                        id: words
                        x: Theme.s
                        y: Theme.xs
                        width: parent.width - 2 * Theme.s

                        Text {
                            width: parent.width
                            textFormat: Text.RichText
                            text: Nav.anchor(Nav.at(Content.base, modelData.href), modelData.title, false)
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
                }
            }
        }
    }
}
