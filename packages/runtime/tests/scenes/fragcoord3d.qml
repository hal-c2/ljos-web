// A material that says where its fragment is by gl_FragCoord: red above the
// middle of the view, green while it is between the near and far planes.
import QtQuick
import QtQuick3D

Rectangle {
    width: 400
    height: 300
    color: "black"

    function read() {
        return {};
    }

    View3D {
        anchors.fill: parent
        camera: camera
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "black"
        }

        PerspectiveCamera {
            id: camera
            z: 260
        }

        Model {
            source: "#Rectangle"
            scale: Qt.vector3d(2, 2, 1)
            materials: CustomMaterial {
                shadingMode: CustomMaterial.Unshaded
                fragmentShader: "materials/fragcoord.frag"
            }
        }
    }
}
