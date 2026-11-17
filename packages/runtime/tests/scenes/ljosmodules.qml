// What ljos-ui's Ljos.Ui, Ljos.Core and Ljos.Models have that Qt Quick has
// too, in a file of Ljós's API: a GridView over a ListModel of
// ListElements, an Instantiator, a PathView, a Canvas, an item's
// transforms, KeyNavigation, an ObjectModel and an Object (ljosui.spec.js).
import Ljos.Ui
import Ljos.Core
import Ljos.Models

Item {
    id: root
    width: 400
    height: 300

    property alias theGrid: grid
    property alias theTurned: turned
    property alias thePath: path
    property alias theFirst: first
    property alias theSecond: second
    property int made: 0
    property int painted: 0
    property int keys: Object.keys({ a: 1, b: 2 }).length
    property Object settings: Object { objectName: "settings"; property int size: 3 }

    ListModel {
        id: names
        ListElement { name: "a" }
        ListElement { name: "b" }
        ListElement { name: "c" }
    }

    GridView {
        id: grid
        width: 200
        height: 100
        cellWidth: 50
        cellHeight: 50
        model: names
        delegate: Rectangle {
            required property string name
            width: 40
            height: 40
            fill: GridView.isCurrentItem ? "tomato" : "seagreen"
        }
    }

    Instantiator {
        model: 2
        delegate: Object { Component.onCompleted: root.made++ }
    }

    ObjectModel {
        id: parts
        Rectangle { width: 10; height: 10 }
        Rectangle { width: 10; height: 10 }
    }

    PathView {
        id: path
        x: 200
        width: 200
        height: 100
        model: parts
        path: Path {
            startX: 0; startY: 50
            PathLine { x: 200; y: 50 }
        }
    }

    Canvas {
        y: 100
        width: 50
        height: 50
        onPaint: root.painted++
    }

    Rectangle {
        id: turned
        x: 100
        y: 150
        width: 40
        height: 20
        transform: [Rotation { angle: 90 }, Scale { xScale: 2 }, Translate { x: 5 }]
    }

    Item {
        id: first
        focus: true
        KeyNavigation.tab: second
    }

    Item {
        id: second
    }
}
