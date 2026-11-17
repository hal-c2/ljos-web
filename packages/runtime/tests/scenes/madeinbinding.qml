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

    // createObject() while a binding makes a property's value: a control's
    // contentItem, given as a Component once it is asked for, makes an
    // object with createObject() as it is made. That object is complete
    // before the call returns, in a completion of its own inside the
    // value's. What the value makes after it (its own contentItem, given
    // once `made` is) is still part of the value, and all of the value is
    // told once, after the binding.
    property var nested: []
    property bool nestedAsked: false
    property alias nestedControl: nestedControl
    property Component nestedPart: Component {
        QtObject { Component.onCompleted: root.nested.push("made completed") }
    }
    property Component nestedContent: Component {
        T.Control {
            property QtObject made: {
                const made = root.nestedPart.createObject(this)
                root.nested.push("createObject returned")
                return made
            }
            contentItem: made ? root.nestedAfter : null
            implicitHeight: contentItem ? 40 : 0
            Component.onCompleted: root.nested.push("content completed")
        }
    }
    property Component nestedAfter: Component {
        Item { Component.onCompleted: root.nested.push("after completed") }
    }
    T.Control {
        id: nestedControl
        contentItem: root.nestedAsked ? root.nestedContent : null
        implicitHeight: {
            if (!root.nestedAsked) return 0
            const height = contentItem.implicitHeight
            root.nested.push("binding returned")
            return height
        }
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

    // What createObject() makes in a binding holds objects of its own (a
    // property's object value, which holds one too): each is complete before
    // what holds it, and all of them before the call returns.
    property var heldOrder: []
    property int heldAsked: 0
    property Component holder: Component {
        QtObject {
            property QtObject inner: QtObject {
                property QtObject deeper: QtObject { Component.onCompleted: root.heldOrder.push("deeper completed") }
                Component.onCompleted: root.heldOrder.push("held completed")
            }
            Component.onCompleted: root.heldOrder.push("holder completed")
        }
    }
    property int makingHeld: {
        if (heldAsked > 0) {
            root.holder.createObject(root)
            heldOrder.push("returned")
        }
        return heldAsked
    }
}
