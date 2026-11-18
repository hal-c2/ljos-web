import QtQuick
import QtQuick as Math
import QtQuick.Layouts as JSON

// Names that are JavaScript's globals given to types: modules imported
// `as Math` and `as JSON`, and an inline component called `Date`. Where a
// type goes they are the file's, and so is what a script reads of their
// types (`Math.Text.AlignRight`, `JSON.GridLayout.TopToBottom`,
// `Date.Night`); the
// rest a script reads of the name is JavaScript's.
Math.Item {
    id: root
    width: 200
    height: 100

    property int right: Math.Text.AlignRight
    property int flow: JSON.GridLayout.TopToBottom
    property string said: JSON.stringify([flow])
    property int night: Date.Night
    property int named: Date.Kind.Night

    component Date: Math.Rectangle {
        enum Kind { Day, Night }
        property int day: 3
        width: 10
        height: 10
    }
    component Late: Date { day: 5 }

    Date { id: today; day: 4 }
    Late { id: later }
    Math.Text { id: aligned; horizontalAlignment: Math.Text.AlignRight }
    Math.Rectangle {
        id: turned
        Math.LayoutMirroring.enabled: true
        anchors.left: parent.left
        width: 50
        height: 10
    }

    function read() {
        return [today.day, later.day, today.width, turned.x, Math.max(2, 5), new Date(0).getTime(), typeof Date.now(),
            right, aligned.horizontalAlignment, flow, said, night, named]
    }
}
