// PrincipledMaterial (features/quick3d/materials): blending, the mask, emission.
import QtQuick
import QtQuick3D

Rectangle {
    width: 400
    height: 300
    color: "#000000"
    property alias blended: blended
    property alias masked: masked
    property alias glowing: glowing
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
            source: "#Rectangle"
            x: -120
            materials: PrincipledMaterial {
                id: blended
                lighting: PrincipledMaterial.NoLighting
                baseColor: "#ff0000"
                opacity: 0.5
            }
        }
        Model {
            source: "#Rectangle"
            materials: PrincipledMaterial {
                id: masked
                lighting: PrincipledMaterial.NoLighting
                baseColor: Qt.rgba(0, 1, 0, 0.3)
                alphaMode: PrincipledMaterial.Mask
                alphaCutoff: 0.5
            }
        }
        Model {
            source: "#Rectangle"
            x: 120
            materials: PrincipledMaterial {
                id: glowing
                baseColor: "#000000"
                emissiveFactor: Qt.vector3d(0, 0, 1)
            }
        }
    }
}
