// A number and a name for the same thing, several ways to say where (features/quick3d/scene-mapping).
import QtQuick
import QtQuick3D

Rectangle {
    width: 400
    height: 300
    color: "#000000"
    property alias cube: cube
    property alias unlit: unlit
    property alias back: back
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
        Model {
            id: cube
            source: "#Rectangle"
            materials: PrincipledMaterial {
                id: unlit
                lighting: 0
                baseColor: "#ff0000"
            }
        }
        Model {
            id: back
            x: 120
            source: "#Rectangle"
            scale: Qt.vector3d(0.5, 0.5, 1)
            eulerRotation.y: 180
            materials: PrincipledMaterial {
                id: backMaterial
                lighting: PrincipledMaterial.NoLighting
                baseColor: "#00ff00"
            }
        }
    }
}
