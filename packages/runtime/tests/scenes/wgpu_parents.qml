// A model is drawn where its parent puts it (features/quick3d/node-parent).
import QtQuick
import QtQuick3D

Rectangle {
    width: 400
    height: 300
    color: "#000000"
    property alias holder: holder
    property alias other: other
    property alias cube: cube
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
        Node {
            id: holder
            x: -100
            Model {
                id: cube
                source: "#Rectangle"
                scale: Qt.vector3d(0.5, 0.5, 1)
                materials: PrincipledMaterial {
                    lighting: PrincipledMaterial.NoLighting
                    baseColor: "#ff00ff"
                }
            }
        }
        Node {
            id: other
            x: 100
        }
    }
}
