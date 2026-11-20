import QtQuick

// A field in a window an item holds, and one in the window around it: each
// is given the keys typed into it, Return as much as the letters. The held
// window is made after the one around it, as what a page opens later is.
Window {
    id: root
    width: 240; height: 100
    visible: true
    color: "white"

    property string outerAccepted: ""
    property string innerAccepted: ""

    TextInput {
        id: outer
        objectName: "outer"
        x: 10; y: 10; width: 80; height: 24
        onAccepted: root.outerAccepted = text
    }

    Loader {
        id: later
        x: 120; y: 10; width: 100; height: 60
        active: false
        sourceComponent: Component {
            WindowContainer {
                window: Window {
                    color: "lightgrey"
                    TextInput {
                        objectName: "inner"
                        x: 10; y: 10; width: 80; height: 24
                        onAccepted: root.innerAccepted = text
                    }
                }
            }
        }
    }

    function hold() { later.active = true }
}
