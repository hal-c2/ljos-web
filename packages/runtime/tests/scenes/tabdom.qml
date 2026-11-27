import QtQuick
import QtQuick.Templates as T

// Tab stops a reader reaches with the keyboard: the browser's own focus
// has to be on each as it is reached, or a screen reader, which follows
// that focus, says nothing as they tab.
Item {
    id: root
    width: 300
    height: 120

    property alias one: one
    property alias two: two
    property alias field: field

    T.Button { id: one; width: 80; height: 30; text: "One"; activeFocusOnTab: true }
    T.Button { id: two; x: 90; width: 80; height: 30; text: "Two"; activeFocusOnTab: true }
    T.TextField { id: field; y: 40; width: 120; height: 30; Accessible.name: "Your name" }
}
