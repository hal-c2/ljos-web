import QtQuick

// Makes what it is in clickable, reachable by Tab, and named for screen readers.
// `enabled: false` puts it out of reach of all three, not only the mouse as a
// plain MouseArea's does.
MouseArea {
    id: touchable

    readonly property var world: {
        let above = parent;
        while (above && above.world === undefined)
            above = above.parent;
        return above?.world ?? null;
    }
    property string name: ""
    property color ring: "#ffd84a"
    readonly property bool pointedAt: containsMouse || activeFocus

    signal activated

    width: parent ? parent.width : 0
    height: parent ? parent.height : 0
    hoverEnabled: true
    activeFocusOnTab: enabled
    cursorShape: Qt.PointingHandCursor
    Accessible.role: Accessible.Button
    Accessible.name: name
    Accessible.ignored: !enabled
    Accessible.onPressAction: if (enabled) activated()
    onClicked: activated()
    Keys.enabled: enabled
    Keys.onReturnPressed: activated()
    Keys.onEnterPressed: activated()
    Keys.onSpacePressed: activated()
    // Hands the focus back to the world rather than setting `focus`, which
    // would drop a `focus:` binding the user of this gave it. A MouseArea's
    // `enabled` does not take focus away by itself.
    onEnabledChanged: if (!enabled && activeFocus) (world ?? parent).forceActiveFocus()
    onActiveFocusChanged: if (activeFocus) world?.reveal(touchable)

    Rectangle {
        visible: touchable.activeFocus
        anchors.fill: parent
        color: "transparent"
        border.width: 1
        border.color: touchable.ring
    }
}
