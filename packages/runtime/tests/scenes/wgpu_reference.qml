// A lit box seen at an angle, lights of two colours, picture compared with
// the native renderer's: tests/references3d/README.md.
import QtQuick
import QtQuick3D

Rectangle {
    width: 400
    height: 300
    color: "#000000"

    View3D {
        anchors.fill: parent
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#202020"
        }
        PerspectiveCamera {
            z: 400
        }
        DirectionalLight {
            eulerRotation.x: -30
            eulerRotation.y: -20
            ambientColor: "#202020"
        }
        PointLight {
            x: -150
            y: 100
            z: 200
            color: "#80a0ff"
            brightness: 0.5
        }
        Model {
            source: "#Cube"
            eulerRotation.x: 25
            eulerRotation.y: 35
            materials: PrincipledMaterial {
                baseColor: "#40a0ff"
                roughness: 0.4
                metalness: 0
            }
        }
        Model {
            source: "#Sphere"
            x: -130
            y: -40
            scale: Qt.vector3d(0.8, 0.8, 0.8)
            materials: PrincipledMaterial {
                baseColor: "#ff8040"
                roughness: 0.3
                metalness: 0.5
            }
        }
    }
}
