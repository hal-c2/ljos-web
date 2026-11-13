// The same cube standing still: once it is drawn, nothing is to be done.
import QtQuick
import QtQuick3D

Item {
    width: 400
    height: 300

    View3D {
        anchors.fill: parent
        environment: SceneEnvironment {
            clearColor: "#202030"
            backgroundMode: SceneEnvironment.Color
        }
        PerspectiveCamera { z: 300 }
        DirectionalLight { eulerRotation.x: -30 }
        Model {
            source: "#Cube"
            eulerRotation: Qt.vector3d(20, 30, 0)
            materials: DefaultMaterial { diffuseColor: "#4080ff" }
        }
    }
}
