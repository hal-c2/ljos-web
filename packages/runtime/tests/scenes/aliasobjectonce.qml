import QtQuick

Item {
    id: root
    property int count: 0
    property int outerCount: 0

    ObjectAliasHost {
        id: host
        thing: QtObject {
            Component.onCompleted: root.count++
        }
    }

    // The same through an alias of an alias.
    ObjectAliasOuter {
        id: outer
        thing: QtObject {
            Component.onCompleted: root.outerCount++
        }
    }

    function read() {
        return [root.count, host.thing != null, root.outerCount, outer.thing != null]
    }
}
