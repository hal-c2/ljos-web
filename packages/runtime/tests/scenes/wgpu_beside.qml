// A shape of the scene's own beside a loader that names no file yet: what
// either renderer draws, until the loader asks for what only wgpu reads.
import QtQuick
import QtQuick3D
import QtQuick3D.AssetUtils

Rectangle {
    width: 400
    height: 300
    color: "#000000"
    property alias loader: loader

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
            source: "#Rectangle"
            x: -150
            scale: Qt.vector3d(0.6, 0.6, 1)
            materials: DefaultMaterial {
                lighting: DefaultMaterial.NoLighting
                diffuseColor: "#0000ff"
            }
        }
        RuntimeLoader {
            id: loader
        }
    }
}
