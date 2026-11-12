// `DragSource`, Qt's attached `Drag` by Ljós's name, with a `DropArea`:
// the one attached object by both names (ljosui.spec.js).
import Ljos.Ui

Item {
    id: root
    width: 400
    height: 300
    property var log: []

    function say(what: string) {
        log.push(what)
    }

    DropArea {
        id: left
        width: 100
        height: 100
        onEntered: root.say("entered")
        onDropped: root.say("dropped")
    }

    Rectangle {
        id: thing
        x: 300
        y: 250
        width: 20
        height: 20
        fill: "red"
        DragSource.hotSpot.x: 10
        DragSource.hotSpot.y: 10
        DragSource.onActiveChanged: root.say("active " + DragSource.active)
    }

    function read() {
        const said = log
        log = []
        return [said, thing.DragSource.active, thing.DragSource.source === thing, left.containsDrag, thing.DragSource.hotSpot.x]
    }

    function step(index: int) {
        switch (index) {
        case 0: thing.DragSource.active = true; break
        case 1: thing.x = 20; thing.y = 20; break
        case 2: root.say("drop " + thing.DragSource.drop()); break
        }
    }
}
