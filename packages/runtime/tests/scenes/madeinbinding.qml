// What a binding makes as it is evaluated (a popup's `contentItem:
// Component {}`, asked for by the popup's `implicitHeight`) is told it is
// complete once the binding is done, so a `Component.onCompleted` in it does
// not keep the binding from seeing what the made object becomes. What a
// binding makes itself, with `createObject()`, is complete before the call
// returns, as in Qt.
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

    property var order: []
    property int asked: 0
    property Component part: Component {
        QtObject { Component.onCompleted: root.order.push("completed") }
    }
    property int making: {
        if (asked > 0) {
            part.createObject(root)
            order.push("returned")
        }
        return asked
    }

    // The same where the binding is a Text's, evaluated as what it read
    // changes, and reads what the made object's onCompleted gave it.
    property int shownAsked: 0
    property alias shown: shown
    property Component readied: Component {
        QtObject {
            property bool ready: false
            Component.onCompleted: ready = true
        }
    }
    Text {
        id: shown
        text: {
            if (root.shownAsked === 0) return ""
            const made = root.readied.createObject(root)
            return made.ready ? "ready" : "not ready"
        }
    }
}
