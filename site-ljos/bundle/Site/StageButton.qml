import QtQuick
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

    readonly property bool live: enabled && !busy

    implicitWidth: words.implicitWidth + 2 * Theme.s
    implicitHeight: 32
    radius: Theme.radiusSmall
    color: primary ? (hit.pressed ? Theme.accentPressed : hit.containsMouse && live ? Theme.accentHover : Theme.accent) : (hit.pressed ? Theme.surfacePressed : hit.containsMouse && live ? Theme.surfaceHover : checked ? Theme.surfaceSelected : Theme.surfaceRaised)
    border.color: primary ? "transparent" : Theme.border
    border.width: primary ? 0 : 1
    opacity: enabled ? 1 : 0.45

    Behavior on color {
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
        color: "transparent"
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
        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
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
        font.pixelSize: Theme.captionSize
        font.weight: Font.DemiBold
    }

    MouseArea {
        id: hit
        anchors.fill: parent
        enabled: button.enabled
        hoverEnabled: true
        Accessible.ignored: true
        cursorShape: button.busy ? Qt.BusyCursor : button.enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
        onClicked: {
            if (button.live)
                button.pressed();
        }
    }
}
