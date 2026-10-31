// Many copies of a model from an instance table (features/quick3d/instancing).
import QtQuick
import QtQuick3D

Rectangle {
    width: 400
    height: 300
    color: "#000000"
    property alias first: first
    property alias model: model
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
            id: model
            source: "#Rectangle"
            scale: Qt.vector3d(0.2, 0.2, 1)
            instancing: InstanceList {
                instances: [
                    InstanceListEntry {
                        id: first
                        position: Qt.vector3d(-50, 0, 0)
                    },
                    InstanceListEntry {
                        position: Qt.vector3d(50, 0, 0)
                    }
                ]
            }
            materials: PrincipledMaterial {
                lighting: PrincipledMaterial.NoLighting
                baseColor: "#ffff00"
            }
        }
    }
}
