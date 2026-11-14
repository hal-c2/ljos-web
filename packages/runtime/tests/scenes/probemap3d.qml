// One picture that lights the scene and is also a material's, read there
// otherwise: from nearest texel and repeated across. How the scene is lit
// by it reads it otherwise again, and the material is to read it its own
// way still.
import QtQuick
import QtQuick3D

Rectangle {
    width: 400
    height: 300
    color: "#202020"

    View3D {
        anchors.fill: parent
        camera: camera
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#202020"
            lightProbe: picture
        }

        Texture {
            id: picture
            source: "../assets/sky.png"
            minFilter: Texture.Nearest
            magFilter: Texture.Nearest
            tilingModeHorizontal: Texture.Repeat
            scaleU: 2
        }

        PerspectiveCamera {
            id: camera
            z: 259.8
            clipNear: 1
        }

        Model {
            source: "#Rectangle"
            scale: Qt.vector3d(3.6, 1, 1)
            materials: PrincipledMaterial {
                lighting: PrincipledMaterial.NoLighting
                baseColorMap: picture
            }
        }
    }
}
