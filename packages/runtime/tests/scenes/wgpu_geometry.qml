// A geometry an application provides (features/quick3d/custom-geometry).
import QtQuick
import QtQuick3D

Rectangle {
    width: 400
    height: 300
    color: "#000000"
    property alias shape: shape
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
            source: ""
            geometry: Geometry {
                id: shape
            }
            materials: PrincipledMaterial {
                lighting: PrincipledMaterial.NoLighting
                baseColor: "#00ffff"
            }
        }
    }
}
