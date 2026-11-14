// A red square an animation moves to and fro once `moving` is set: a scene
// that changes in every frame, and nothing else does.
import QtQuick
import QtQuick3D

Rectangle {
    width: 400
    height: 300
    color: "#000000"
    property alias square: square
    property bool moving: false
    View3D {
        anchors.fill: parent
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#202020"
        }
        OrthographicCamera {
            z: 500
        }
        Model {
            id: square
            source: "#Rectangle"
            scale: Qt.vector3d(0.5, 0.5, 1)
            materials: PrincipledMaterial {
                lighting: PrincipledMaterial.NoLighting
                baseColor: "#ff0000"
            }
            SequentialAnimation on x {
                running: moving
                loops: Animation.Infinite
                NumberAnimation { from: -100; to: 100; duration: 1000 }
                NumberAnimation { from: 100; to: -100; duration: 1000 }
            }
        }
    }
}
