// Sixty-four cubes of one material under two lights, one of which circles
// them: a frame of the 3D perf harness's own spec (perf3d.spec.js) in which
// what each model is drawn with is the same but where it is.
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
        PerspectiveCamera { y: 300; z: 500; eulerRotation.x: -30 }
        DirectionalLight { eulerRotation.x: -45; brightness: 0.6 }
        PointLight {
            x: 300 * Math.cos(root.angle * Math.PI / 180)
            z: 300 * Math.sin(root.angle * Math.PI / 180)
            y: 100
            color: "#80c0ff"
        }
        DefaultMaterial { id: paint; diffuseColor: "#4080ff" }
        // 8 columns by 8 rows, 40 units apart.
        Repeater3D {
            model: 64
            Model {
                source: "#Cube"
                x: (index % 8 - 3.5) * 40
                z: (Math.floor(index / 8) - 3.5) * 40
                scale: Qt.vector3d(0.2, 0.2, 0.2)
                materials: paint
            }
        }
    }
}
