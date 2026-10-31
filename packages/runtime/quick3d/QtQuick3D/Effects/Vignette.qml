import QtQuick
import QtQuick3D

// Written from Qt's documentation of the type, with a shader of Ljós's.
Effect {
    property real vignetteStrength: 15.0
    property vector3d vignetteColor: Qt.vector3d(0.5, 0.5, 0.5)
    property real vignetteRadius: 0.35

    passes: Pass {
        shaders: Shader {
            stage: Shader.Fragment
            shader: "qrc:/ljos-quick3d/shaders/vignette.frag"
        }
    }
}
