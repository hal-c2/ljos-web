// Sixty squares a Repeater3D makes, ten by six, 40 pixels apart: a scene of
// many objects of which one changes, and of objects coming and going. They
// share one material, made outside the delegate.
import QtQuick
import QtQuick3D

Rectangle {
    width: 400
    height: 300
    color: "#000000"
    property alias squares: squares
    property alias holder: holder
    property int shown: 60
    View3D {
        anchors.fill: parent
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#202020"
        }
        OrthographicCamera {
            z: 500
        }
        PrincipledMaterial {
            id: red
            lighting: PrincipledMaterial.NoLighting
            baseColor: "#ff0000"
        }
        Repeater3D {
            id: squares
            model: shown
            Model {
                source: "#Rectangle"
                x: (index % 10 - 4.5) * 40
                y: (2.5 - Math.floor(index / 10)) * 40
                scale: Qt.vector3d(0.2, 0.2, 1)
                materials: red
            }
        }
        Node {
            id: holder
            y: -15
        }
    }
}
