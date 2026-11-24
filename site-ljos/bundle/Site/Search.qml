import QtQuick
import Site
import Ljos.Core
import "../nav.js" as Nav

// The site's search: the docs' page titles and the headings on them, and
// the demos' pages (scripts/build.mjs, search.json), found as the reader
// types. Up and Down choose, Return goes, Escape clears; each
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
        // A field in the header is a pill where the look has corners.
        radius: Theme.radiusSmall > 0 ? height / 2 : 0
        color: field.activeFocus ? Theme.surfaceRaised : Theme.surface
        border.color: field.activeFocus ? Theme.focusRing : Theme.border
        border.width: field.activeFocus ? 2 : 1

        // A magnifying glass.
        Item {
            x: 14
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
            // Up to the key's box where it shows, else the field's own
            // edge: a narrow rail's field ends its words, never runs them
            // under the key or out of the box.
            width: (keyHint.visible ? keyHint.x - Theme.xs : field.x + field.width) - x
            elide: Text.ElideRight
            anchors.verticalCenter: parent.verticalCenter
            visible: field.text === ""
            text: t`Search docs and demos`
            color: Theme.textMuted
            font.family: Theme.sans
            font.pixelSize: field.font.pixelSize
            Accessible.ignored: true
        }
        // The key that comes here, where a keyboard is likely.
        Rectangle {
            id: keyHint
            // Only where the words fit beside it: a rail as narrow as
            // Cyberpunk's keeps the room for them.
            visible: !Theme.narrow && field.text === "" && !field.activeFocus && search.width >= 220
            x: parent.width - width - Theme.s
            anchors.verticalCenter: parent.verticalCenter
            width: 22
            height: 22
            radius: Theme.radiusSmall > 0 ? 6 : 0
            color: Theme.canvas
            border.color: Theme.divider
            border.width: 1
            Accessible.ignored: true

            Text {
                anchors.centerIn: parent
                text: "/"
                color: Theme.textMuted
                font.family: Theme.mono
                font.pixelSize: Theme.captionSize - 1
            }
        }
        TextInput {
            id: field
            x: 38
            width: parent.width - x - Theme.m
            // The whole box's height, so a press anywhere in it is the field's.
            height: parent.height
            verticalAlignment: TextInput.AlignVCenter
            color: Theme.text
            selectionColor: Theme.surfaceSelected
            selectedTextColor: Theme.text
            font.family: Theme.sans
            // A phone's browser zooms into a field set under 16 px.
            font.pixelSize: Theme.narrow ? Theme.bodySize : Theme.uiSize + 1
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
                // The reader's words as they typed them, never as markup.
                textFormat: Text.PlainText
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
                            // A link is rich text, which is never elided:
                            // a title wider than the list wraps inside it,
                            // between words, or within a word too long
                            // for a line.
                            wrapMode: Text.Wrap
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
