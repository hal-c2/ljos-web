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

    // Named before it is made; given a binding that is refused; made with a
    // value it refuses; bound to what becomes undefined.
    property Rectangle selected: later
    property Rectangle kept
    property bool gone: false
    property Rectangle fading: gone ? undefined : rect
    Component { id: maker; Item { property Rectangle thing } }
    Component { id: counter; Item { property int n } }
    Rectangle { id: later }

    // Held by a Binding over it, and given a binding it refuses.
    property Rectangle layered
    Binding { target: root; property: "layered"; value: rect }
    Rectangle { id: other }

    function layers() {
        const is = (value) => value === null ? "null" : value === undefined ? "undefined" : value === rect ? "rect" : value === other ? "other" : value === plain ? "plain" : typeof value;
        const said = [`layered ${is(layered)}`];
        layered = Qt.binding(() => plain);
        said.push(`refused ${is(layered)}`);
        layered = Qt.binding(() => other);
        said.push(`taken ${is(layered)}`);
        return said;
    }

    // Put over by a layer (a theme's role, a Block's content) whose binding
    // it refuses.
    property Rectangle overlaid: rect
    property int pick: 0
    readonly property var named: ({ rect, other, plain })
    function bindPlain() { overlaid = Qt.binding(() => plain) }

    function more() {
        const is = (value) => value === null ? "null" : value === undefined ? "undefined" : value === rect ? "rect" : value === later ? "later" : value === plain ? "plain" : typeof value;
        const said = [`selected ${is(selected)}`];
        kept = rect;
        try {
            kept = Qt.binding(() => plain);
            said.push(`binding ok ${is(kept)}`);
        } catch (error) {
            said.push(`binding ${error.message} ${is(kept)}`);
        }
        try {
            const object = maker.createObject(root, { thing: plain });
            said.push(`created ${object ? is(object.thing) : "none"}`);
        } catch (error) {
            said.push(`created threw ${error.message}`);
        }
        try {
            const object = counter.createObject(root, { n: "abc" });
            said.push(`counted ${object ? object.n : "none"}`);
        } catch (error) {
            said.push(`counted threw ${error.message}`);
        }
        said.push(`fading ${is(fading)}`);
        gone = true;
        said.push(`faded ${is(fading)}`);
        return said;
    }

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
