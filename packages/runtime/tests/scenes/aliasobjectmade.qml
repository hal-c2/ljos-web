import QtQuick

// An alias of an alias, given a value by an instance a binding makes
// (`createObject()`), read by that instance's own `Component.onCompleted`:
// it reads what it was given, not what the target held before.
Item {
    id: root
    property var seen: "unread"
    property QtObject given: QtObject { objectName: "given" }

    Component {
        id: maker
        ObjectAliasOuter {
            thing: root.given
            Component.onCompleted: root.seen = thing
        }
    }

    property var made: maker.createObject(root)

    // `made` first: the binding is evaluated when it is read, and its
    // instance completes as it is.
    function read() {
        const made = root.made
        return [root.seen === root.given, made.thing === root.given]
    }
}
