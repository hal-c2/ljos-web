// A texture of an item that has no size yet: its canvas is 0 by 0, as a
// ShaderEffect's is until it is laid out and has drawn.
import QtQuick
import QtQuick3D

Rectangle {
    width: 400
    height: 300
    color: "#000000"
    property int effectSize: 0
    property alias cube: cube

    ShaderEffect {
        id: effect
        width: effectSize
        height: effectSize
    }

    View3D {
        anchors.fill: parent
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#202020"
        }
        OrthographicCamera { z: 500 }
        Model {
            x: -100
            source: "#Rectangle"
            materials: PrincipledMaterial {
                lighting: PrincipledMaterial.NoLighting
                baseColor: "#00ff00"
                baseColorMap: Texture { sourceItem: effect }
            }
        }
        Model {
            id: cube
            x: 100
            scale: Qt.vector3d(0.5, 0.5, 1)
            source: "#Rectangle"
            materials: PrincipledMaterial {
                lighting: PrincipledMaterial.NoLighting
                baseColor: "#ff0000"
            }
        }
    }
}
