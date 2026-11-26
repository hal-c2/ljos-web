pragma Scripts: JavaScript; import Ljos.Ui
import Ljos.Layout
import Site
import Ljos.Core
import "later.js" as Later

// Which shell frames the site: a button naming the one shown, and a
// popover with the four and what each is, and the way to the shell's
// own QML. Picking one swaps the shell
// live (Main.qml): the page and what the reader did on it stay.
// The button is drawn as the header's others are; the popover is drawn
// with Ljós's own controls and comes the first time it is pressed
// (Site/ShellChoices.qml), so no page's first load carries them.
Rectangle {
    id: switcher

    property var preferences: null
    // Shown with its words, or as an icon where a toolbar is tight.
    property bool compact: false
    // Asked to show a shell's own QML (Site/ShellSource.qml).
    signal sourceAsked(string name)
    // About to show the choices, drawn in Ljós's own controls (Main.qml
    // gives those the site's colours).
    signal choosing

    readonly property string shown: preferences ? preferences.shown : "elegant"
    readonly property string label: preferences ? preferences.labelOf(shown) : ""
    readonly property bool opened: choices.item ? choices.item.opened : false

    function toggle() {
        if (choices.item) {
            choices.item.toggle();
        } else if (choices.status === Loader.Error) {
            // Its module did not come (a dropped connection): the press
            // asks for it again, as the first did.
            choices.setSource(Later.shellChoices);
        } else {
            switcher.choosing();
            choices.active = true;
        }
    }

    implicitWidth: switcher.compact ? Theme.target : row.implicitWidth + 2 * Theme.xs
    implicitHeight: Theme.target
    radius: Theme.radiusSmall
    fill: hit.pressed ? Theme.surfacePressed : hit.containsMouse || switcher.opened ? Theme.surfaceHover : "transparent"
    border.width: activeFocus ? 2 : 0
    border.color: Theme.focusRing

    activeFocusOnTab: true
    Accessible.role: Accessible.Button
    // Where its words show, the name holds them (a reader who says what
    // they see, "Elegant", finds it); where only the icon does, the
    // name says what it is for.
    Accessible.name: switcher.compact || !label ? t`Switch shell` : t`Current shell: ${label}`
    Accessible.onPressAction: () => switcher.toggle()
    Keys.onPressed: (event) => {
        if (event.key === Key.Return || event.key === Key.Enter || event.key === Key.Space) {
            switcher.toggle();
            event.accepted = true;
        }
    }

    Row {
        id: row
        anchors.centerIn: parent
        spacing: Theme.xs

        // A window with a pane beside its page: what a shell is.
        Rectangle {
            Layout.alignment: Align.VCenter
            width: 18
            height: 16
            radius: 3
            fill: "transparent"
            border.width: 2
            border.color: Theme.text

            Rectangle {
                // Where it starts, read from the left; a right-to-left page
                // sets it as far from the right (LayoutMirroring).
                readonly property real startX: 6
                x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
                y: 2
                width: 2
                height: parent.height - 4
                fill: Theme.text
            }
        }
        Text {
            Layout.alignment: Align.VCenter
            visible: !switcher.compact
            text: switcher.label
            color: Theme.text
            font.family: Theme.sans
            font.size: Theme.captionSize + 1
            font.weight: Font.DemiBold
        }
        // It opens: a chevron, two strokes meeting below.
        Item {
            Layout.alignment: Align.VCenter
            visible: !switcher.compact
            width: 12
            height: 8

            Rectangle {
                // Where it starts, read from the left; a right-to-left page
                // sets it as far from the right (LayoutMirroring).
                readonly property real startX: 1
                x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
                y: 3
                width: 7
                height: 2
                radius: 1
                fill: Theme.textMuted
                rotation: 40
            }
            Rectangle {
                // Where it starts, read from the left; a right-to-left page
                // sets it as far from the right (LayoutMirroring).
                readonly property real startX: 4
                x: App.layoutDirection === Direction.RightToLeft ? parent.width - width - startX : startX
                y: 3
                width: 7
                height: 2
                radius: 1
                fill: Theme.textMuted
                rotation: -40
            }
        }
    }

    // Under the button's own presses: the choices stand over the button
    // only as the item their popover opens beside.
    Loader {
        id: choices
        anchors.fill: parent
        active: false
        source: Later.shellChoices
        onLoaded: {
            item.preferences = bind(() => switcher.preferences);
            item.shown = bind(() => switcher.shown);
            item.toggle();
        }
    }
    Connections {
        target: choices.item
        function onSourceAsked(name) {
            switcher.sourceAsked(name);
        }
    }
    PointerArea {
        id: hit
        anchors.fill: parent
        hoverEnabled: true
        Accessible.ignored: true
        cursorShape: Cursor.PointingHand
        onClicked: switcher.toggle()
    }
}
