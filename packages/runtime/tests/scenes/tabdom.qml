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
    // A stop that is no control: nothing of its own shows it has focus.
    property alias link: link
    Rectangle {
        id: link
        y: 80; width: 80; height: 30
        activeFocusOnTab: true
        Accessible.role: Accessible.Link
        Accessible.name: "Home"
    }

    // Made and only measured, never in the page, as a page sizes a card by
    // what it could hold: it is no window the first Tab could go to.
    readonly property Item measured: Row {
        T.Button { text: "Measured"; activeFocusOnTab: true; focus: true }
    }
}
