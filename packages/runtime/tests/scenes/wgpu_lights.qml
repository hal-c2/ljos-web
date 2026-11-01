// Colours and brightness of lights on a white surface (features/quick3d/lights).
import QtQuick
import QtQuick3D

Rectangle {
    width: 400
    height: 300
    color: "#000000"
    property alias light: light
    property alias second: second
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
        DirectionalLight {
            id: light
            color: "#ff0000"
            brightness: 1
        }
        DirectionalLight {
            id: second
            color: "#00ff00"
            brightness: 0
        }
        Model {
            source: "#Rectangle"
            materials: PrincipledMaterial {
                baseColor: "#ffffff"
                roughness: 1
                metalness: 0
                specularAmount: 0
            }
        }
    }
}
