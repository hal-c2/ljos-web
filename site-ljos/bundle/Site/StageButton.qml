pragma Scripts: JavaScript; import Ljos.Ui
import Site

// A button of a stage's toolbar, in the look of Ljós's own controls: a
// raised surface in a hairline, its words in the body's colour, the
// accent only for the one that starts something. A pointer, a keyboard
// (Return, Enter or Space) and a screen reader's press all reach it;
// one that cannot be pressed now says so and takes no press.
Rectangle {
    id: button

    property string text: ""
    // What a screen reader calls it, where the words alone say less:
    // "Run" is "Run this example" to it.
    property string label: text
    // The one call to act on the stage: Run, before anything runs.
    property bool primary: false
    property bool busy: false
    // One that stays down while what it shows is shown (Source), said to
    // a screen reader as pressed or not.
    property bool checkable: false
    property bool checked: false
    signal pressed
    // A pointer came onto it, focus was brought to it or a finger landed
    // on it: what a press would start can be got ready ahead of it.
    signal approached

    onActiveFocusChanged: {
        if (activeFocus)
            approached();
    }

    readonly property bool live: enabled && !busy

    // The one that starts something stands a step larger than the rest,
    // so Run is the stage's first thing to find.
    implicitWidth: words.implicitWidth + 2 * (primary ? Theme.m : Theme.s)
    // A finger's target on a phone; a pointer's, a little less, beside it.
    implicitHeight: Theme.narrow ? Theme.target : primary ? 36 : 32
    radius: Theme.radiusSmall
    fill: primary ? (hit.pressed ? Theme.accentPressed : hit.containsMouse && live ? Theme.accentHover : Theme.accent) : (hit.pressed ? Theme.surfacePressed : hit.containsMouse && live ? Theme.surfaceHover : checked ? Theme.surfaceSelected : Theme.surfaceRaised)
    border.color: primary ? "transparent" : Theme.border
    border.width: primary ? 0 : 1
    opacity: enabled ? 1 : 0.45

    Behavior on fill {
        ColorAnimation {
            duration: Theme.moveSmall
            easing.type: Easing.OutCubic
        }
    }
    Behavior on opacity {
        NumberAnimation {
            duration: Theme.moveSmall
        }
    }

    // The ring stands clear of the button, so it reads on the accent.
    Rectangle {
        visible: button.activeFocus
        anchors.fill: parent
        anchors.margins: -3
        radius: button.radius + 3
        fill: "transparent"
        border.color: Theme.focusRing
        border.width: 2
    }

    activeFocusOnTab: enabled
    Accessible.role: Accessible.Button
    Accessible.name: label
    Accessible.checkable: checkable
    Accessible.checked: checked
    Accessible.onPressAction: () => {
        if (button.live)
            button.pressed();
    }
    Keys.onPressed: (event) => {
        if (event.key === Key.Return || event.key === Key.Enter || event.key === Key.Space) {
            if (button.live)
                button.pressed();
            event.accepted = true;
        }
    }

    Text {
        id: words
        anchors.centerIn: parent
        text: button.text
        color: button.primary ? Theme.textOnAccent : Theme.text
        font.family: Theme.sans
        font.size: button.primary ? Theme.uiSize : Theme.captionSize
        font.weight: Font.DemiBold
    }

    PointerArea {
        id: hit
        anchors.fill: parent
        enabled: button.enabled
        hoverEnabled: true
        Accessible.ignored: true
        cursorShape: button.busy ? Cursor.Busy : button.enabled ? Cursor.PointingHand : Cursor.Arrow
        onContainsMouseChanged: {
            if (containsMouse)
                button.approached();
        }
        onPressed: button.approached()
        onClicked: {
            if (button.live)
                button.pressed();
        }
    }
}
