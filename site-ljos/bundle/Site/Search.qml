pragma Scripts: JavaScript
import Ljos.Ui
import Site
import Ljos.Core
import "../nav.js" as Nav
import "later.js" as Later

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
    // What the reader typed, as the results read it.
    readonly property string query: field.text.trim()
    readonly property bool showing: query !== "" && open && (pages !== null || trouble !== "")
    property int chosen: 0
    property bool open: false

    implicitWidth: 280
    implicitHeight: 40

    function load() {
        if (pages !== null || !(Nav.inBrowser() || Nav.onDesktop()))
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
        fill: field.activeFocus ? Theme.surfaceRaised : Theme.surface
        border.color: field.activeFocus ? Theme.focusRing : Theme.border
        border.width: field.activeFocus ? 2 : 1

        // A magnifying glass.
        Item {
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (LayoutMirroring).
            readonly property real startX: 14
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
            anchors.verticalCenter: parent.verticalCenter
            width: 16
            height: 16
            Accessible.ignored: true

            Rectangle {
                width: 12
                height: 12
                radius: 6
                fill: "transparent"
                border.color: Theme.textMuted
                border.width: 2
            }
            Rectangle {
                // Where it starts, read from the left; a right-to-left page
                // sets it as far from the right (LayoutMirroring).
                readonly property real startX: 9
                x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
                y: 11
                width: 7
                height: 2
                radius: 1
                fill: Theme.textMuted
                rotation: 45
            }
        }
        Text {
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (LayoutMirroring).
            readonly property real startX: field.startX
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
            // Up to the key's box where it shows, else the field's own
            // edge: a narrow rail's field ends its words, never runs them
            // under the key or out of the box.
            width: (keyHint.visible ? keyHint.startX - Theme.xs : field.startX + field.width) - startX
            elide: Text.ElideRight
            anchors.verticalCenter: parent.verticalCenter
            visible: field.text === ""
            text: t`Search docs and demos`
            color: Theme.textMuted
            font.family: Theme.sans
            font.size: field.font.size
            Accessible.ignored: true
        }
        // The key that comes here, where a keyboard is likely.
        Rectangle {
            id: keyHint
            // Only where the words fit beside it: a rail as narrow as
            // Cyberpunk's keeps the room for them.
            visible: !Theme.narrow && field.text === "" && !field.activeFocus && search.width >= 220
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (LayoutMirroring).
            readonly property real startX: parent.width - width - Theme.s
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
            anchors.verticalCenter: parent.verticalCenter
            width: 22
            height: 22
            radius: Theme.radiusSmall > 0 ? 6 : 0
            fill: Theme.canvas
            border.color: Theme.divider
            border.width: 1
            Accessible.ignored: true

            Text {
                anchors.centerIn: parent
                text: "/"
                color: Theme.textMuted
                font.family: Theme.mono
                font.size: Theme.captionSize - 1
            }
        }
        TextInput {
            id: field
            // Where it starts, read from the left; a right-to-left page
            // sets it as far from the right (LayoutMirroring).
            readonly property real startX: 38
            x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
            width: parent.width - startX - Theme.m
            // The whole box's height, so a press anywhere in it is the field's.
            height: parent.height
            verticalAlignment: TextInput.AlignVCenter
            color: Theme.text
            selectionColor: Theme.surfaceSelected
            selectedTextColor: Theme.text
            font.family: Theme.sans
            // A phone's browser zooms into a field set under 16 px.
            font.size: Theme.narrow ? Theme.bodySize : Theme.uiSize + 1
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
                if (event.key === Key.Down) {
                    search.open = true;
                    search.chosen = Math.min(search.chosen + 1, search.results.length - 1);
                    event.accepted = true;
                } else if (event.key === Key.Up) {
                    search.chosen = Math.max(search.chosen - 1, 0);
                    event.accepted = true;
                } else if (event.key === Key.Return || event.key === Key.Enter) {
                    search.go(search.chosen);
                    event.accepted = true;
                } else if (event.key === Key.Escape) {
                    field.text = "";
                    search.open = false;
                    event.accepted = true;
                }
            }
        }
    }

    // What was found, under the field and over the page. It is its own
    // module (later.js), fetched the first time there is something to
    // show: no page's first paint has a query typed (tests/payload.spec.js).
    Loader {
        id: list
        z: 10
        y: search.height + Theme.xxs
        readonly property Item owner: search
        visible: search.showing
        active: false
        source: Later.searchResults
    }
    // Results that could not be fetched are asked for again with the next
    // query, or the next time there is one to show.
    function want() {
        if (!showing)
            return;
        if (list.status === Loader.Error)
            list.setSource(Later.searchResults);
        else
            list.active = true;
    }
    onShowingChanged: want()
    onQueryChanged: want()
}
