// What a binding makes as it is evaluated (a popup's `contentItem:
// Component {}`, asked for by the popup's `implicitHeight`) is told it is
// complete once the binding is done, so a `Component.onCompleted` in it does
// not keep the binding from seeing what the made object becomes.
import QtQuick
import QtQuick.Templates as T
import QtQuick.Controls.Basic as Basic

Item {
    id: root
    width: 400
    height: 300
    property var log: []
    property alias popup: popup
    property alias combo: combo
    T.Popup {
        id: popup
        implicitHeight: contentItem.implicitHeight
        contentItem: Component {
            ListView {
                implicitHeight: contentHeight
                model: 3
                delegate: Item { width: 10; height: 40 }
                Item { Component.onCompleted: root.log.push("completed") }
            }
        }
    }
    Basic.ComboBox { id: combo; x: 200; model: ["Red", "Green", "Blue"] }
}
