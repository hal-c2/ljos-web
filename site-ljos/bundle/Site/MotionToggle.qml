import QtQuick
import Site
import Ljos.Core

// Reduced motion, the reader's: it starts as their browser says and,
// pressed, says otherwise for this site, which is kept (Theme.setCalm).
// It is a checkbox to a screen reader, "Reduce motion", checked while
// motion is reduced; its icon is three lines of travel, the lower two
// shortened while it is.
Rectangle {
    id: toggle

    // What the toggle stands on, which it is filled with at rest.
    property color ground: Theme.canvas

    width: Theme.target
    height: Theme.target
    radius: Theme.radiusSmall
    color: hit.pressed ? Theme.surfacePressed : hit.containsMouse ? Theme.surfaceHover : Theme.calm ? Theme.surfaceSelected : ground
    border.width: activeFocus ? 2 : 0
    border.color: Theme.focusRing

    activeFocusOnTab: true
    Accessible.role: Accessible.CheckBox
    Accessible.name: t`Reduce motion`
    Accessible.checkable: true
    Accessible.checked: Theme.calm
    Accessible.onPressAction: () => Theme.setCalm(!Theme.calm)
    Keys.onPressed: (event) => {
        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
            Theme.setCalm(!Theme.calm);
            event.accepted = true;
        }
    }

    // A ball and the lines it leaves behind it: with reduced motion the
    // lines draw in and the ball stands still.
    Row {
        anchors.centerIn: parent
        spacing: 3
        Accessible.ignored: true

        Column {
            anchors.verticalCenter: parent.verticalCenter
            spacing: 3

            Repeater {
                model: [7, 10, 7]
                Item {
                    required property var modelData
                    width: 10
                    height: 2
                    Rectangle {
                        x: parent.width - width
                        width: Theme.calm ? 0 : modelData
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
        }
        Rectangle {
            anchors.verticalCenter: parent.verticalCenter
            width: 10
            height: 10
            radius: 5
            color: Theme.text
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
