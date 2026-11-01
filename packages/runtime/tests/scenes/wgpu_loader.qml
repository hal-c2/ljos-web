// A glTF model loaded while the application runs (features/quick3d/runtime-loader).
import QtQuick
import QtQuick3D
import QtQuick3D.AssetUtils
Rectangle {
    width: 400
    height: 300
    color: "#000000"
    property alias loader: loader
    readonly property bool succeeded: loader.status === RuntimeLoader.Success
    readonly property bool failed: loader.status === RuntimeLoader.Error
    View3D {
        id: view
        anchors.fill: parent
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#202020"
        }
        OrthographicCamera {
            id: camera
            z: 500
        }
        RuntimeLoader {
            id: loader
            source: "wgpu_models/square.gltf"
        }
    }
}
