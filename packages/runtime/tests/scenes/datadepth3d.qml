// A picture given as its numbers, which a test then gives a depth: a
// volume is not a 2D picture, on either renderer.
import QtQuick
import QtQuick3D

Rectangle {
    width: 400
    height: 300
    color: "#202020"
    property alias picture: picture

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
                baseColor: "#ffffff"
                baseColorMap: Texture { textureData: TextureData { id: picture } }
            }
        }
    }
}
