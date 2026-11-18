import QtQuick
import QtQuick as Math

// Names that are JavaScript's globals given to types: a module imported
// `as Math` and an inline component called `Date`. Where a type goes they
// are the file's; in a script each is still JavaScript's.
Math.Item {
    id: root
    width: 200
    height: 100

    component Date: Math.Rectangle {
        enum Kind { Day, Night }
        property int day: 3
        width: 10
        height: 10
    }
    component Late: Date { day: 5 }

    Date { id: today; day: 4 }
    Late { id: later }
    Math.Rectangle {
        id: turned
        Math.LayoutMirroring.enabled: true
        anchors.left: parent.left
        width: 50
        height: 10
    }

    function read() {
        return [today.day, later.day, today.width, turned.x, Math.max(2, 5), new Date(0).getTime(), typeof Date.now()]
    }
}
