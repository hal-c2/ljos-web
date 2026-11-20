import QtQuick

// A window an item holds, made with the item and ended with it, as a Loader
// makes and ends what it loads.
Window {
    id: root
    width: 200; height: 100
    visible: true
    color: "white"

    Loader {
        id: loader
        x: 20; y: 10; width: 60; height: 40
        sourceComponent: Component {
            WindowContainer {
                window: Window { color: "red" }
            }
        }
    }

    function end() { loader.active = false }
}
