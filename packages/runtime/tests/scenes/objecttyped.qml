// A property typed with an object type holds an object of that type, or of
// one made from it, or null: what else it is given is refused, as Qt refuses
// it (`objecttyped.spec.js`, whose answers are qml6's).
import QtQuick

Item {
    id: root

    component Tile: Rectangle {
        property int n
    }

    property Rectangle thing
    property Item any
    property QtObject loose
    property Tile tile
    property alias aliased: holder.thing
    property int k: 0
    property Rectangle direct: plain
    property Rectangle chosen: k > 0 ? plain : rect

    Item {
        id: holder
        property Rectangle thing
    }
    Rectangle { id: rect }
    Tile { id: made }
    QtObject { id: plain }
    Timer { id: timer }

    function run() {
        const said = [];
        const is = (value) => value === null ? "null" : value === undefined ? "undefined" : value === rect ? "rect" : value === made ? "made" : value === plain ? "plain" : value === timer ? "timer" : value === root ? "root" : typeof value;
        const attempt = (label, write, read) => {
            try {
                write();
                said.push(`${label} ok ${is(read())}`);
            } catch (error) {
                said.push(`${label} ${error.message} ${is(read())}`);
            }
        };
        said.push(`declared ${is(thing)} ${is(direct)} ${is(chosen)}`);
        attempt("rect", () => thing = rect, () => thing);
        attempt("plain", () => thing = plain, () => thing);
        attempt("item", () => thing = root, () => thing);
        attempt("tile", () => thing = made, () => thing);
        attempt("null", () => thing = null, () => thing);
        attempt("undefined", () => thing = undefined, () => thing);
        attempt("number", () => thing = 3, () => thing);
        attempt("record", () => thing = ({}), () => thing);
        attempt("any rect", () => any = rect, () => any);
        attempt("any timer", () => any = timer, () => any);
        attempt("loose timer", () => loose = timer, () => loose);
        attempt("loose rect", () => loose = rect, () => loose);
        attempt("tile made", () => tile = made, () => tile);
        attempt("tile rect", () => tile = rect, () => tile);
        attempt("alias plain", () => aliased = plain, () => aliased);
        attempt("alias rect", () => aliased = rect, () => aliased);
        k = 1;
        said.push(`bound ${is(chosen)}`);
        return said;
    }
}
