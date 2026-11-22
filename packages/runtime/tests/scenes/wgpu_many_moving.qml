// A view of declared nodes alone, and beside it as many as `count` views that
// also have a loader of `file`: each with a blue square that moves up and
// down once `moving` is set. What the page's limit on WebGL contexts meets.
import QtQuick
import QtQuick3D
import QtQuick3D.AssetUtils

Rectangle {
    id: root
    width: 640
    height: 180
    color: "#000000"
    property bool moving: false
    property int count: 0
    property string file: ""

    component Moving: View3D {
        width: 80
        height: 60
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#202020"
        }
        OrthographicCamera {
            z: 500
        }
        Model {
            source: "#Rectangle"
            z: 20
            scale: Qt.vector3d(0.2, 0.2, 1)
            materials: DefaultMaterial {
                lighting: DefaultMaterial.NoLighting
                diffuseColor: "#0000ff"
            }
            SequentialAnimation on y {
                running: root.moving
                loops: Animation.Infinite
                NumberAnimation { from: -15; to: 15; duration: 1000 }
                NumberAnimation { from: 15; to: -15; duration: 1000 }
            }
        }
    }

    Moving {}
    Repeater {
        model: root.count
        Moving {
            id: cell
            required property int index
            x: (cell.index + 1) % 8 * 80
            y: Math.floor((cell.index + 1) / 8) * 60
            RuntimeLoader {
                source: root.file
            }
        }
    }
}
