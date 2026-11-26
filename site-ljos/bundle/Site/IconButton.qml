pragma Scripts: JavaScript; import Ljos.Ui
import Site

// A square button of the header, its icon drawn in the theme's own
// colours: a pointer, a keyboard (Return, Enter or Space) and a
// screen reader's press all reach it.
Rectangle {
    id: button

    property string label: ""
    // What the button stands on, which it is filled with at rest.
    property color ground: Theme.canvas
    signal pressed

    width: Theme.target
    height: Theme.target
    radius: Theme.radiusSmall
    fill: hit.pressed ? Theme.surfacePressed : hit.containsMouse ? Theme.surfaceHover : ground
    border.width: activeFocus ? 2 : 0
    border.color: Theme.focusRing

    activeFocusOnTab: true
    Accessible.role: Accessible.Button
    Accessible.name: label
    Accessible.onPressAction: () => button.pressed()
    Keys.onPressed: (event) => {
        if (event.key === Key.Return || event.key === Key.Enter || event.key === Key.Space) {
            button.pressed();
            event.accepted = true;
        }
    }

    PointerArea {
        id: hit
        anchors.fill: parent
        hoverEnabled: true
        Accessible.ignored: true
        cursorShape: Cursor.PointingHand
        onClicked: button.pressed()
    }
}
