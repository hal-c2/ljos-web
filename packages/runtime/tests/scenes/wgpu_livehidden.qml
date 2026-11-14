// A square showing what is painted on a canvas, which can be hidden for a
// while and shown again, and another square to change in between.
import QtQuick
import QtQuick3D

Rectangle {
    width: 400
    height: 300
    color: "#000000"
    property bool drawn: true
    property color faceColor: "#ff0000"
    property real elsewhere: 150

    onFaceColorChanged: face.requestPaint()

    Canvas {
        id: face
        width: 64
        height: 64
        onPaint: {
            const ctx = getContext("2d");
            ctx.fillStyle = faceColor;
            ctx.fillRect(0, 0, width, height);
        }
    }

    View3D {
        anchors.fill: parent
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#202020"
        }
        OrthographicCamera { z: 500 }
        Model {
            source: "#Rectangle"
            visible: drawn
            materials: PrincipledMaterial {
                lighting: PrincipledMaterial.NoLighting
                baseColorMap: Texture { sourceItem: face }
            }
        }
        Model {
            source: "#Rectangle"
            x: elsewhere
            scale: Qt.vector3d(0.2, 0.2, 1)
            materials: PrincipledMaterial {
                lighting: PrincipledMaterial.NoLighting
                baseColor: "#00ff00"
            }
        }
    }
}
