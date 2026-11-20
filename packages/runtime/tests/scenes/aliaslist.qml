import QtQuick

// Objects given to an alias of an item's `data`: declared ones are added
// to what the item has, and a binding's list is the whole of it, as Qt
// 6.12 has them, and so is a list a script writes to it, in its order; that
// write ends the binding. One of its `resources` holds what it is given
// without drawing it.
Item {
    id: root
    objectName: "root"
    width: 200
    height: 100
    property bool flag: true
    property Item one: Rectangle { objectName: "one" }
    property Item two: Rectangle { objectName: "two" }
    property Item three: Rectangle { objectName: "three" }
    property Item alpha: Rectangle { objectName: "alpha" }
    property Item beta: Rectangle { objectName: "beta" }
    property Item gamma: Rectangle { objectName: "gamma" }
    property Item four: Rectangle { objectName: "four" }
    property Item five: Rectangle { objectName: "five" }
    property Item six: Rectangle { objectName: "six" }

    AliasListHost {
        id: declared
        content: [
            Rectangle { id: given; objectName: "given" },
            Timer { objectName: "timer" }
        ]
    }

    AliasListHost {
        id: bound
        content: root.flag ? [root.one] : [root.two]
    }

    AliasListHost {
        id: written
    }

    AliasListHost {
        id: ordered
    }

    AliasListHost {
        id: rebound
        content: root.flag ? [root.four] : [root.five]
    }

    Rectangle { id: drawn; objectName: "drawn" }
    Rectangle { id: other; objectName: "other" }
    AliasListHost {
        id: keeping
        kept: [
            Rectangle { id: made; objectName: "made" },
            Timer { objectName: "kept timer" }
        ]
    }
    AliasListHost {
        id: holding
        kept: root.flag ? [drawn] : [other]
    }

    function write() {
        written.content = [three]
    }
    function reorder() {
        ordered.content = [alpha, beta, gamma]
        const first = names(ordered.inner.children)
        ordered.content = [gamma, alpha, beta]
        return [first, names(ordered.inner.children)]
    }
    function writeOverBinding() {
        rebound.content = [six]
    }
    function reboundNow() {
        return { children: names(rebound.inner.children), fiveInside: five.parent === rebound.inner }
    }
    function heldOne() {
        return drawn
    }
    function otherOne() {
        return other
    }
    function names(list) {
        return Array.from(list, (each) => each.objectName).join(",")
    }
    function parentOf(object) {
        return object.parent ? object.parent.objectName : null
    }
    function held() {
        return {
            kept: names(keeping.inner.resources),
            drawing: names(keeping.inner.children),
            made: parentOf(made),
            holding: names(holding.inner.resources),
            drawn: parentOf(drawn),
            other: parentOf(other)
        }
    }
    function read() {
        return {
            declared: names(declared.inner.children),
            resources: names(declared.inner.resources),
            given: given.parent ? given.parent.objectName : null,
            bound: names(bound.inner.children),
            one: one.parent ? one.parent.objectName : null,
            two: two.parent ? two.parent.objectName : null,
            written: names(written.inner.children)
        }
    }
}
