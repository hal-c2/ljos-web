// Picking what a RuntimeLoader read (features/quick3d/runtime-loader):
// each node of the file with a mesh is met by a ray, under its own name.
import QtQuick
import QtQuick3D
import QtQuick3D.AssetUtils
Rectangle {
    width: 400
    height: 300
    color: "#000000"
    property alias view: view
    property alias pair: pair
    readonly property bool loaded: pair.status === RuntimeLoader.Success && cube.status === RuntimeLoader.Success
    View3D {
        id: view
        anchors.fill: parent
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#202020"
        }
        OrthographicCamera {
            z: 500
        }
        // Its left square is 40 across at x -50, its right one half of
        // that at x 50: as the file places them.
        RuntimeLoader {
            id: pair
            objectName: "pair"
            y: 100
            source: "wgpu_models/pair.gltf"
        }
        // A cube of 100 inside a node twice as tall, in one binary file.
        RuntimeLoader {
            id: cube
            objectName: "box"
            x: 150
            scale: Qt.vector3d(0.5, 0.5, 0.5)
            source: "wgpu_models/cube.glb"
        }
    }
}
