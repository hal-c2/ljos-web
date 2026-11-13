// scenes/spin.qml with nothing animating: what qml6 does standing still
// (qml6.js), as it has no clock to stop.
import QtQuick
import QtQuick3D

Window {
    id: root
    width: 400
    height: 300
    visible: true
    color: "#2a2a40"

    property real angle: 30

    Text {
        anchors.horizontalCenter: parent.horizontalCenter
        y: 16
        text: "A turning cube"
        color: "white"
        font.pixelSize: 20
    }

    View3D {
        anchors.fill: parent
        anchors.topMargin: 48
        environment: SceneEnvironment {
            clearColor: "#202030"
            backgroundMode: SceneEnvironment.Color
        }
        PerspectiveCamera { z: 300 }
        DirectionalLight { eulerRotation.x: -30 }
        Model {
            source: "#Cube"
            eulerRotation: Qt.vector3d(20, root.angle, 0)
            materials: DefaultMaterial { diffuseColor: "#4080ff" }
        }
    }
}
