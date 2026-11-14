// A document that draws in space, for `wgpu_held.qml` and `wgpu_nested.qml`.
import QtQuick
import QtQuick3D

Item {
    View3D {
        anchors.fill: parent
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#202020"
        }
        OrthographicCamera { z: 500 }
        Model {
            source: "#Rectangle"
            materials: PrincipledMaterial {
                lighting: PrincipledMaterial.NoLighting
                baseColor: "#ff0000"
            }
        }
    }
}
