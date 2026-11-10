// A node's vectors in a program's hands: `position`, `scale` and the others
// are the node's still, so a member assigned moves the node and one read is
// what the node has now; what a property is given of one is the vector as
// it was. And nodes that place themselves a member at a time as they are
// made, as a table's dice do.
pragma ComponentBehavior: Bound

import QtQuick
import QtQuick3D

Item {
    id: root
    width: 400
    height: 300

    property vector3d saved
    property var kept
    property var list: []
    property vector3d bound: node.position
    property int changes: 0
    onBoundChanged: changes++

    View3D {
        anchors.fill: parent

        Node {
            id: node
        }

        Node {
            id: other
        }

        Repeater3D {
            id: repeater
            model: 4
            delegate: Node {
                required property int index
                property real wide: 3.5
                Component.onCompleted: {
                    position.x = wide * Math.cos(index / (Math.PI / 4))
                    position.y = index * wide * 1.41
                    position.z = wide * Math.sin(index / (Math.PI / 4))
                }
            }
        }
    }

    function round(value) {
        return Math.round(value * 100) / 100 + 0
    }

    function read() {
        const out = []
        let p = node.position
        node.x = 5
        out.push(p.x)
        kept = node.position
        node.x = 6
        out.push(kept.x)
        saved = node.position
        node.x = 7
        out.push(saved.x)
        node.position.x = 9
        out.push(node.x)
        let q = node.position
        q.x = 11
        out.push(node.x)
        list = [node.position]
        node.x = 12
        out.push(list[0].x)
        const local = [node.position]
        node.x = 13
        out.push(local[0].x)
        let s = node.scale
        node.scale.x = 3
        out.push(s.x)
        kept = node.scale
        node.scale.x = 4
        out.push(kept.x)
        other.position = node.position
        node.x = 14
        out.push(other.x)
        const t = node.position.times(2)
        node.x = 15
        out.push(t.x)
        out.push(JSON.stringify(node.position), "" + node.position, node.position === node.position)
        out.push(bound.x, changes > 0)
        const places = []
        for (let i = 0; i < repeater.count; i++) {
            const at = repeater.objectAt(i).position
            places.push([round(at.x), round(at.y), round(at.z)])
        }
        out.push(places)
        return out
    }
}
