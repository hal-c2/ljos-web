import QtQuick
import QtQuick3D

// Written from Qt's documentation of the type, with a shader of Ljós's.
Effect {
    property real redStrength: 1.0
    property real greenStrength: 1.5
    property real blueStrength: 1.0
    property real saturation: 0.0

    passes: Pass {
        shaders: Shader {
            stage: Shader.Fragment
            shader: "qrc:/ljos-quick3d/shaders/colormaster.frag"
        }
    }
}
