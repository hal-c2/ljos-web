// Two loaders that name no file yet beside a shape of the scene's own, and
// a fog that is off: what a view reads ahead of wgpu, and what can come
// before it turns to wgpu.
import QtQuick
import QtQuick3D
import QtQuick3D.AssetUtils

Rectangle {
    width: 400
    height: 300
    color: "#000000"
    property alias loader: loader
    property alias other: other
    property alias fog: fog

    View3D {
        anchors.fill: parent
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#202020"
            fog: Fog {
                id: fog
                enabled: false
                depthEnabled: true
            }
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
        RuntimeLoader {
            id: other
        }
    }
}
