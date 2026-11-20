import QtQuick

// An object declared for an alias of an alias of a property that cannot
// hold it.
Item {
    id: root
    width: 100
    height: 100

    TypedAliasOuter {
        id: outer
        thing: QtObject { objectName: "plain" }
    }

    function held() {
        return outer.thing
    }
}
