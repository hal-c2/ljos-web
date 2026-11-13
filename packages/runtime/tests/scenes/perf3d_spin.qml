// A lit cube turning without end: a frame of the 3D perf harness's own
// spec (perf3d.spec.js), which every frame changes.
import QtQuick
import QtQuick3D

Item {
    id: root
    width: 400
    height: 300

    property real angle: 0
    NumberAnimation on angle {
        from: 0
        to: 360
        duration: 4000
        loops: Animation.Infinite
    }

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
            eulerRotation: Qt.vector3d(20, root.angle, 0)
            materials: DefaultMaterial { diffuseColor: "#4080ff" }
        }
    }
}
