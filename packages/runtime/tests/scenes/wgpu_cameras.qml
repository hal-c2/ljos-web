// What a camera shows (features/quick3d/cameras): magnification, and moving it.
import QtQuick
import QtQuick3D

Rectangle {
    width: 400
    height: 300
    color: "#000000"
    property alias cube: cube
    property alias camera: camera
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
            materials: DefaultMaterial {
                lighting: DefaultMaterial.NoLighting
                diffuseColor: "#ffffff"
            }
        }
    }
}
