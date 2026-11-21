import QtQuick

// An alias of an object's property, read before the objects that properties
// hold are all made: the reader, made first, reads the alias as its own
// value completes. The object declared for the alias is made once, by that
// read, and it is the one the target is then given.
Item {
    id: root
    property int count: 0
    property QtObject made: null
    property QtObject seen: null

    Item {
        property QtObject reader: QtObject {
            Component.onCompleted: root.seen = host.thing
        }
    }

    ObjectAliasHost {
        id: host
        thing: QtObject {
            id: hostThing
            Component.onCompleted: { root.count++; root.made = hostThing }
        }
    }

    function read() {
        return [root.count, root.seen != null && root.seen === root.made, host.thing === root.made]
    }
}
