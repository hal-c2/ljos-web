// A View3D a Loader makes once the page is up, with a Repeater3D in it whose
// delegates have materials of their own: what each makes is made in a
// computation's callback, which a page made at the start never is.
import QtQuick
import QtQuick3D

Rectangle {
    width: 400
    height: 300
    color: "#000000"
    property alias loader: loader
    property int shown: 2
    Loader {
        id: loader
        anchors.fill: parent
        active: false
        sourceComponent: View3D {
            environment: SceneEnvironment {
                backgroundMode: SceneEnvironment.Color
                clearColor: "#202020"
            }
            OrthographicCamera {
                z: 500
            }
            Repeater3D {
                model: shown
                Model {
                    source: "#Rectangle"
                    x: index * 80 - 160
                    scale: Qt.vector3d(0.4, 0.4, 0.4)
                    materials: PrincipledMaterial {
                        lighting: PrincipledMaterial.NoLighting
                        baseColor: "#ff0000"
                    }
                }
            }
        }
    }
}
