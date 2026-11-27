// Connections to the signals a type keeps apart from a property of the same
// name: a Popup's `opened`, a MouseArea's and a Button's `pressed`. Each is
// a signal and a property both, and a handler of the signal's name is the
// signal's.
import QtQuick
import QtQuick.Controls

Item {
    id: root
    width: 400
    height: 200

    property var heard: []

    MouseArea { id: area; x: 0; y: 0; width: 100; height: 100 }
    Button { id: button; x: 200; y: 0; width: 100; height: 100; text: "Press" }
    Popup { id: popup; x: 0; y: 120; width: 50; height: 50 }

    Connections {
        target: popup
        function onOpened() { root.heard.push("popup opened " + popup.opened); }
    }
    Connections {
        target: area
        function onPressed(mouse) { root.heard.push("area pressed " + area.pressed); }
    }
    Connections {
        target: button
        function onPressed() { root.heard.push("button pressed " + button.pressed); }
    }

    function openPopup() { popup.open(); }
}
