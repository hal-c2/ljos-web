import QtQuick
import QtQuick3D

// Written from Qt's documentation of the type, with shaders of Ljós's: what
// is bright is kept in a small picture, blurred one way and then the other,
// and laid back over the scene before its exposure and gamma.
Effect {
    id: root

    property real bloomThreshold: 1.0
    property real blurFalloff: 0.0
    property real channelThreshold: 1.0
    property real exposure: 0.0
    property real gamma: 1.0
    property real tonemappingLerp: 1.0

    // Told by the passes that blur.
    property vector2d along: Qt.vector2d(1, 0)
    property TextureInput bloomed: TextureInput {}

    Buffer {
        id: bright
        name: "hdrBloomBright"
        format: Buffer.RGBA16F
        sizeMultiplier: 0.25
    }
    Buffer {
        id: across
        name: "hdrBloomAcross"
        format: Buffer.RGBA16F
        sizeMultiplier: 0.25
    }
    Buffer {
        id: blurred
        name: "hdrBloomBlurred"
        format: Buffer.RGBA16F
        sizeMultiplier: 0.25
    }
    Shader {
        id: blur
        stage: Shader.Fragment
        shader: "qrc:/ljos-quick3d/shaders/bloomblur.frag"
    }

    passes: [
        Pass {
            shaders: Shader {
                stage: Shader.Fragment
                shader: "qrc:/ljos-quick3d/shaders/bloombright.frag"
            }
            output: bright
        },
        Pass {
            shaders: blur
            commands: [
                BufferInput {
                    buffer: bright
                },
                SetUniformValue {
                    target: "along"
                    value: Qt.vector2d(1, 0)
                }
            ]
            output: across
        },
        Pass {
            shaders: blur
            commands: [
                BufferInput {
                    buffer: across
                },
                SetUniformValue {
                    target: "along"
                    value: Qt.vector2d(0, 1)
                }
            ]
            output: blurred
        },
        Pass {
            shaders: Shader {
                stage: Shader.Fragment
                shader: "qrc:/ljos-quick3d/shaders/bloomtonemap.frag"
            }
            commands: BufferInput {
                buffer: blurred
                sampler: "bloomed"
            }
        }
    ]
}
