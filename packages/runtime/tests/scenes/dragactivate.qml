import QtQuick

// What a DragHandler says on the move that makes it active, and on the moves
// and the release after: the same scene, without its TestCase, as Qt was
// measured with (dragactivate.spec.js has the moves and what Qt said).
Item {
    id: root
    width: 400; height: 300
    property var log: []
    property alias drag: drag
    property alias dragItem: dragItem
    function p(s) { log.push(s) }
    function tr(h) { return `t=${h.translation.x},${h.translation.y} at=${h.activeTranslation.x},${h.activeTranslation.y} pt=${h.persistentTranslation.x},${h.persistentTranslation.y}` }

    Rectangle {
        id: dragItem; y: 200; width: 50; height: 50; color: "navy"
        onXChanged: root.p(`item x=${x}`)
        onYChanged: root.p(`item y=${y}`)
        DragHandler {
            id: drag
            onActiveChanged: root.p(`active ${active} ${root.tr(drag)} c=${centroid.position.x},${centroid.position.y} sp=${centroid.scenePosition.x},${centroid.scenePosition.y}`)
            onTranslationChanged: (delta) => root.p(`tr d=${delta.x},${delta.y} ${root.tr(drag)} item=${dragItem.x},${dragItem.y}`)
            onActiveTranslationChanged: root.p(`atC ${activeTranslation.x},${activeTranslation.y}`)
            onPersistentTranslationChanged: root.p(`ptC ${persistentTranslation.x},${persistentTranslation.y}`)
            xAxis.onActiveValueChanged: (delta) => root.p(`xAxis ${xAxis.activeValue} d=${delta}`)
            yAxis.onActiveValueChanged: (delta) => root.p(`yAxis ${yAxis.activeValue} d=${delta}`)
            onCentroidChanged: root.p(`centroid ${centroid.position.x},${centroid.position.y} sp=${centroid.scenePosition.x},${centroid.scenePosition.y}`)
        }
    }
    Rectangle {
        id: limited; x: 100; y: 200; width: 50; height: 50; color: "maroon"
        onXChanged: root.p(`lim item x=${x}`)
        DragHandler {
            id: lim; yAxis.enabled: false; xAxis.minimum: 90; xAxis.maximum: 150
            onActiveChanged: root.p(`lim active ${active} ${root.tr(lim)}`)
            onTranslationChanged: (delta) => root.p(`lim tr d=${delta.x},${delta.y} ${root.tr(lim)} item=${limited.x}`)
            xAxis.onActiveValueChanged: (delta) => root.p(`lim xAxis ${xAxis.activeValue} d=${delta}`)
        }
    }
    Rectangle {
        id: nullTarget; x: 200; y: 200; width: 50; height: 50; color: "gray"
        onXChanged: root.p(`nt item x=${x}`)
        DragHandler {
            id: nt; target: null
            onActiveChanged: root.p(`nt active ${active} ${root.tr(nt)}`)
            onTranslationChanged: (delta) => root.p(`nt tr d=${delta.x},${delta.y} ${root.tr(nt)}`)
            xAxis.onActiveValueChanged: (delta) => root.p(`nt xAxis ${xAxis.activeValue} d=${delta}`)
        }
    }
    // The axes' limits bound the persistent translation, not this drag's.
    Rectangle {
        id: bounded; x: 300; y: 200; width: 50; height: 50; color: "teal"
        onXChanged: root.p(`bd item x=${x}`)
        DragHandler {
            id: bd; target: null; xAxis.minimum: -30; xAxis.maximum: 30
            onPersistentTranslationChanged: root.p(`bd ptC ${persistentTranslation.x}`)
            onActiveChanged: root.p(`bd active ${active} ${root.tr(bd)} xv=${xAxis.activeValue}`)
            onTranslationChanged: (delta) => root.p(`bd tr d=${delta.x},${delta.y} ${root.tr(bd)} xv=${xAxis.activeValue}`)
            xAxis.onActiveValueChanged: (delta) => root.p(`bd xAxis ${xAxis.activeValue} d=${delta}`)
        }
    }
    // Out of the moves' way: says only what it says as it is made.
    Rectangle {
        id: pinched; width: 50; height: 50; color: "olive"
        PinchHandler {
            onActiveTranslationChanged: root.p(`pinch atC ${activeTranslation.x},${activeTranslation.y}`)
            onPersistentTranslationChanged: root.p(`pinch ptC ${persistentTranslation.x},${persistentTranslation.y}`)
        }
    }
}
