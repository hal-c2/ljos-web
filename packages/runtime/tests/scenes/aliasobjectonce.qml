import QtQuick

Item {
    id: root
    property int count: 0
    property int outerCount: 0
    // The objects made, as each one's completion saw itself: the target
    // must hold that one, not another made after it.
    property QtObject made: null
    property QtObject outerMade: null

    ObjectAliasHost {
        id: host
        thing: QtObject {
            id: hostThing
            Component.onCompleted: { root.count++; root.made = hostThing }
        }
    }

    // The same through an alias of an alias.
    ObjectAliasOuter {
        id: outer
        thing: QtObject {
            id: outerThing
            Component.onCompleted: { root.outerCount++; root.outerMade = outerThing }
        }
    }

    function read() {
        return [root.count, root.made != null && host.thing === root.made, root.outerCount, root.outerMade != null && outer.thing === root.outerMade]
    }
}
