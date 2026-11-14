// A singleton that draws in space, for `wgpu_singleton.qml`: qmlc makes
// it as `function Space3D$component($props)`, with no `export default`
// on its start.
pragma Singleton
import QtQuick
import QtQuick3D

Item {
    width: 200
    height: 150

    View3D {
        anchors.fill: parent
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#202020"
        }
        OrthographicCamera { z: 500 }
        Model {
            source: "#Rectangle"
            materials: PrincipledMaterial {
                lighting: PrincipledMaterial.NoLighting
                baseColor: "#ff0000"
            }
        }
    }
}
