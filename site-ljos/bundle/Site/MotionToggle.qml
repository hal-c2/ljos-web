import QtQuick
import Site

// Reduced motion, the reader's: it starts as their browser says and,
// pressed, says otherwise for this site, which is kept (Theme.setCalm).
// It is a checkbox to a screen reader, "Reduce motion", checked while
// motion is reduced; its icon is three lines of travel, the lower two
// shortened while it is.
Rectangle {
    id: toggle

    // What the toggle stands on, which it is filled with at rest.
    property color ground: Theme.canvas

    width: 40
    height: 40
    radius: Theme.radiusSmall
    color: hit.pressed ? Theme.surfacePressed : hit.containsMouse ? Theme.surfaceHover : Theme.calm ? Theme.surfaceSelected : ground
    border.width: activeFocus ? 2 : 0
    border.color: Theme.focusRing

    activeFocusOnTab: true
    Accessible.role: Accessible.CheckBox
    Accessible.name: "Reduce motion"
    Accessible.checkable: true
    Accessible.checked: Theme.calm
    Accessible.onPressAction: () => Theme.setCalm(!Theme.calm)
    Keys.onPressed: (event) => {
        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
            Theme.setCalm(!Theme.calm);
            event.accepted = true;
        }
    }

    Column {
        anchors.centerIn: parent
        spacing: 4

        Repeater {
            model: 3
            Rectangle {
                required property int index
                x: index * 3
                width: Theme.calm && index > 0 ? 8 : 18 - index * 3
                height: 2
                radius: 1
                color: Theme.text
                Behavior on width {
                    NumberAnimation {
                        duration: Theme.moveSmall
                        easing.type: Easing.OutCubic
                    }
                }
            }
        }
    }

    MouseArea {
        id: hit
        anchors.fill: parent
        hoverEnabled: true
        Accessible.ignored: true
        cursorShape: Qt.PointingHandCursor
        onClicked: Theme.setCalm(!Theme.calm)
    }
}
