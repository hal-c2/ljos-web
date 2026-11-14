// Two glTF models loaded while the application runs, the second named later:
// what one loader waits for arriving is nothing to the other.
import QtQuick
import QtQuick3D
import QtQuick3D.AssetUtils
Rectangle {
    width: 400
    height: 300
    color: "#000000"
    property alias first: first
    property alias second: second
    readonly property bool loaded: first.status === RuntimeLoader.Success && second.status === RuntimeLoader.Success
    View3D {
        anchors.fill: parent
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#202020"
        }
        OrthographicCamera {
            z: 500
        }
        RuntimeLoader {
            id: first
            x: -100
            source: "wgpu_models/square.gltf"
        }
        RuntimeLoader {
            id: second
            x: 100
        }
    }
}
