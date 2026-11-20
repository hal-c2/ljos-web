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
    property QtObject tick: Timer { objectName: "tick" }
    property Item seven: Rectangle { objectName: "seven" }
    property Item eight: Rectangle { objectName: "eight" }
    property Item nine: Rectangle { objectName: "nine" }
    property Item ten: Rectangle { objectName: "ten" }
    property Item eleven: Rectangle { objectName: "eleven" }
    property Item early: Rectangle { objectName: "seven" }
    property Item late: Rectangle { objectName: "eight" }
    property Item over: Rectangle { objectName: "nine" }
    property Item given: Rectangle { objectName: "ten" }
    property Item lent: Rectangle { objectName: "eleven" }
    property Item bound: Rectangle { objectName: "bound" }
    property Item unbound: Rectangle { objectName: "unbound" }
    property Item scripted: Rectangle { objectName: "scripted" }
    property Item stated: Rectangle { objectName: "stated" }
    property bool echoing: false

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
        id: both
    }

    AliasListHost {
        id: loose
    }

    AliasListHost {
        id: staged
        content: root.flag ? [root.seven] : [root.eight]
    }

    // A handler that the state's own write runs, writing another alias as
    // a script does.
    AliasListHost {
        id: echo
        content: [root.eleven]
    }
    Connections {
        target: staged.inner
        enabled: root.echoing
        function onChildrenChanged() {
            echo.content = [root.ten]
        }
    }

    // An alias of the alias `relayHost.content`, and hosts whose list has
    // no binding: one declared, one with nothing given.
    AliasListHost {
        id: relayHost
        content: root.flag ? [root.early] : [root.late]
    }
    QtObject {
        id: relay
        property alias relayed: relayHost.content
    }
    AliasListHost {
        id: madeHost
        content: [
            Rectangle { objectName: "given" }
        ]
    }
    AliasListHost {
        id: plainHost
    }
    // An object declared for an alias of an alias of a list, whose own
    // binding reads what the test changes.
    AliasListRelay {
        id: declaredRelay
        relayed: [
            Rectangle { objectName: root.flag ? "on" : "off" }
        ]
    }
    // A list whose binding a script's write ends before the state begins.
    AliasListHost {
        id: assignedHost
        content: root.flag ? [root.bound] : [root.unbound]
    }

    states: [
        State {
            name: "over"
            PropertyChanges {
                target: staged
                content: [root.nine]
            }
        },
        State {
            name: "relay"
            PropertyChanges {
                target: relay
                relayed: [root.over]
            }
        },
        State {
            name: "made"
            PropertyChanges {
                target: madeHost
                content: [root.given]
            }
            PropertyChanges {
                target: plainHost
                content: [root.lent]
            }
            PropertyChanges {
                target: assignedHost
                content: [root.stated]
            }
        }
    ]

    AliasListHost {
        id: rebound
        content: root.flag ? [root.four] : [root.five]
    }

    Rectangle { id: drawn; objectName: "drawn" }
    Rectangle { id: other; objectName: "other" }
    Rectangle { id: shared; objectName: "shared" }
    Loader {
        id: loading
        active: false
        sourceComponent: Component {
            AliasListHost {}
        }
    }
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
    // Items both drawn by the item and held in its resources, the held
    // ones then given in another order: they are still drawn by it.
    function reorderHeld() {
        both.content = [alpha, beta]
        both.kept = [alpha, beta]
        const first = [names(both.inner.children), names(both.inner.resources)]
        both.kept = [beta, alpha]
        return [first, [names(both.inner.children), names(both.inner.resources)]]
    }
    // An object the item has among its resources without holding it (a
    // Timer given to its data) starts the list written to them, and keeps
    // its place ahead of what follows it.
    function holdAfterLoose() {
        loose.content = [tick]
        loose.kept = [tick, alpha]
        const first = names(loose.inner.resources)
        loose.kept = [tick, alpha, beta]
        return [first, names(loose.inner.resources)]
    }
    // A loaded host holds `shared` in its resources until the Loader ends
    // it, which disposes of it without destroying it.
    // A state that changes the alias overrides its binding while it lasts;
    // once it ends, the binding gives the list again and follows on.
    function throughState() {
        const seen = [names(staged.inner.children)]
        root.state = "over"
        seen.push(names(staged.inner.children))
        root.flag = false
        seen.push(names(staged.inner.children))
        root.state = ""
        seen.push(names(staged.inner.children))
        root.flag = true
        seen.push(names(staged.inner.children))
        return seen
    }
    // The state ends, and what its write runs writes `echo`: that write is
    // a script's, and stays.
    function echoOfState() {
        root.state = "over"
        root.echoing = true
        root.state = ""
        return [names(staged.inner.children), names(echo.inner.children)]
    }
    function throughRelay() {
        const seen = [names(relayHost.inner.children)]
        root.state = "relay"
        seen.push(names(relayHost.inner.children))
        root.flag = false
        seen.push(names(relayHost.inner.children))
        root.state = ""
        seen.push(names(relayHost.inner.children))
        root.flag = true
        seen.push(names(relayHost.inner.children))
        return seen
    }
    // Lists with no binding, through a state and out of it.
    function unboundThroughState() {
        const seen = [[names(madeHost.inner.children), names(plainHost.inner.children)]]
        root.state = "made"
        seen.push([names(madeHost.inner.children), names(plainHost.inner.children)])
        root.state = ""
        seen.push([names(madeHost.inner.children), names(plainHost.inner.children)])
        return seen
    }
    // A list whose binding a script ended, through a state and out of it.
    function assignedThroughState() {
        assignedHost.content = [root.scripted]
        const seen = [names(assignedHost.inner.children)]
        root.state = "made"
        seen.push(names(assignedHost.inner.children))
        root.state = ""
        seen.push(names(assignedHost.inner.children))
        root.flag = false
        seen.push(names(assignedHost.inner.children))
        return seen
    }
    function declaredRelayOnce() {
        const children = () => declaredRelay.host.inner.children
        const first = children()[children().length - 1]
        const before = names(children())
        root.flag = false
        return [before, names(children()), children()[children().length - 1] === first]
    }
    function holdInLoader() {
        loading.active = true
        loading.item.kept = [shared]
    }
    function unload() {
        loading.active = false
    }
    function sharedOne() {
        return shared
    }
    // The held ones given again in another order, `times` times over.
    function reholdHeld(times) {
        for (let i = 0; i < times; i++)
            both.kept = i % 2 ? [alpha, beta] : [beta, alpha]
    }
    function bothInner() {
        return both.inner
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
