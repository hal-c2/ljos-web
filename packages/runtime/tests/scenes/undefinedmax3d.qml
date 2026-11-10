// A shader that divides nothing by nothing and takes the larger of that and
// 0. GLSL says what max does: y if x < y, otherwise x.
import QtQuick
import QtQuick3D

Rectangle {
    width: 100
    height: 100
    color: "#202020"

    View3D {
        anchors.fill: parent
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#202020"
        }
        PerspectiveCamera {
            z: 100
        }
        Model {
            source: "#Rectangle"
            materials: CustomMaterial {
                shadingMode: CustomMaterial.Unshaded
                fragmentShader: "shaders/undefinedmax.frag"
                property real nothing: 0
            }
        }
    }
}
