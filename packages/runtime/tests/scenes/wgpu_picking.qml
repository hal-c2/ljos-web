// Picking a model under the pointer (features/quick3d/picking), by the scene as it is.
import QtQuick
import QtQuick3D

Rectangle {
    width: 400
    height: 300
    color: "#000000"
    property alias view: view
    property alias near: nearer
    property alias far: farther
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
            id: nearer
            objectName: "nearer"
            source: "#Rectangle"
            pickable: true
            z: 10
            materials: PrincipledMaterial {
                lighting: PrincipledMaterial.NoLighting
                baseColor: "#ff0000"
            }
        }
        Model {
            id: farther
            objectName: "farther"
            source: "#Rectangle"
            pickable: true
            scale: Qt.vector3d(2, 2, 1)
            materials: PrincipledMaterial {
                lighting: PrincipledMaterial.NoLighting
                baseColor: "#0000ff"
            }
        }
    }
}
