// What reads Ljos.Design's roles, beside state of its own: a theme put over
// the roles is followed, and the state is what it was.
import QtQuick
import QtQuick.Templates as T
import Ljos.Design

Item {
    id: root
    width: 400
    height: 200

    property bool toggled: false
    property alias label: label
    property alias box: box
    property alias field: field

    Text { id: label; text: "gap " + Spacing.md; color: Colors.text }
    Rectangle { id: box; y: 30; width: Spacing.md * 2; height: 10; color: Colors.accent }
    T.TextField { id: field; y: 60; width: 200; height: 30 }
}
