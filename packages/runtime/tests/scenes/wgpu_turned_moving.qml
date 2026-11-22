// Two views, each with a blue square that an animation moves up and down
// once `moving` is set, and a loader that names no file yet: what both
// renderers draw and keep in motion, and what turns a view to wgpu.
import QtQuick
import QtQuick3D
import QtQuick3D.AssetUtils

Rectangle {
    id: root
    width: 400
    height: 300
    color: "#000000"
    property bool moving: false
    property alias turning: turningView
    property alias first: first
    property alias second: second

    View3D {
        id: turningView
        width: 200
        height: 300
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#202020"
        }
        OrthographicCamera {
            z: 500
        }
        Model {
            source: "#Rectangle"
            x: -50
            z: 20
            scale: Qt.vector3d(0.6, 0.6, 1)
            materials: DefaultMaterial {
                lighting: DefaultMaterial.NoLighting
                diffuseColor: "#0000ff"
            }
            SequentialAnimation on y {
                running: root.moving
                loops: Animation.Infinite
                NumberAnimation { from: -70; to: 70; duration: 1000 }
                NumberAnimation { from: 70; to: -70; duration: 1000 }
            }
        }
        RuntimeLoader {
            id: first
        }
    }
    View3D {
        x: 200
        width: 200
        height: 300
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#202020"
        }
        OrthographicCamera {
            z: 500
        }
        Model {
            source: "#Rectangle"
            x: -50
            z: 20
            scale: Qt.vector3d(0.6, 0.6, 1)
            materials: DefaultMaterial {
                lighting: DefaultMaterial.NoLighting
                diffuseColor: "#0000ff"
            }
            SequentialAnimation on y {
                running: root.moving
                loops: Animation.Infinite
                NumberAnimation { from: -70; to: 70; duration: 1000 }
                NumberAnimation { from: 70; to: -70; duration: 1000 }
            }
        }
        RuntimeLoader {
            id: second
        }
    }
}
