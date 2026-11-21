// What a state that overrides an alias an object was declared for gives
// back as it ends: the object declared, made once, however many times the
// state comes and goes. The same through an alias of an alias, which is
// assigned rather than bound.
import QtQuick

Item {
    id: root
    property int count: 0
    property int outerCount: 0
    property QtObject made: null
    property QtObject outerMade: null

    QtObject {
        id: other
    }

    ObjectAliasHost {
        id: host
        thing: QtObject {
            id: hostThing
            Component.onCompleted: {
                root.count++;
                root.made = hostThing;
            }
        }
    }

    ObjectAliasOuter {
        id: outer
        thing: QtObject {
            id: outerThing
            Component.onCompleted: {
                root.outerCount++;
                root.outerMade = outerThing;
            }
        }
    }

    states: State {
        name: "other"
        PropertyChanges {
            host.thing: other
            outer.thing: other
        }
    }

    function look() {
        return [root.count, host.thing === root.made, host.thing === other, root.outerCount, outer.thing === root.outerMade, outer.thing === other];
    }

    // As each state begins and ends, twice.
    function read() {
        const seen = [look()];
        for (let i = 0; i < 2; i++) {
            state = "other";
            seen.push(look());
            state = "";
            seen.push(look());
        }
        return seen;
    }
}
